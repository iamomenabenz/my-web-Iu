// Server-only tool executor.
// Adapter modes: mock | dry-run | remote-agent | ssh (ssh still stubbed in M4).
// Restricted/dangerous tools are queued into `approvals`; safe tools run inline.
// All tool activity (queued, executed, denied) is written to `audit_log`.
// Approval lifecycle events also create a `notifications` row.

import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyRisk, summarizeInput, type ToolName } from "./risk";
import { isBrowserTool } from "./registry";
import {
  daemonDeleteFile,
  daemonExec,
  daemonListFiles,
  daemonLogs,
  daemonReadFile,
  daemonSearchFiles,
  daemonWorkspaceInfo,
  daemonWriteFile,
  resolveDaemonConfig,
  type DaemonConfig,
} from "./remote-agent.server";
import {
  browserClick,
  browserExtract,
  browserFill,
  browserNavigate,
  browserScreenshot,
  resolveBrowserAgentConfig,
} from "./browser-agent.server";

export type AdapterMode = "mock" | "dry-run" | "remote-agent" | "ssh" | "self-hosted-local";

export interface ExecContext {
  supabase: SupabaseClient;
  userId: string;
  conversationId: string | null;
  workspaceId?: string | null;
  adapterMode: AdapterMode;
}

export interface ToolResult {
  ok: boolean;
  pending?: boolean;
  approvalId?: string;
  executionId?: string;
  mode: AdapterMode;
  risk: "safe" | "restricted" | "dangerous";
  summary: string;
  note?: string;
  data?: unknown;
}

async function audit(
  ctx: Pick<ExecContext, "conversationId" | "workspaceId" | "userId">,
  action: string,
  target: string,
  payload: Record<string, unknown>,
) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_log").insert({
      actor: ctx.userId,
      workspace_id: ctx.workspaceId ?? null,
      action,
      target,
      payload: {
        conversation_id: ctx.conversationId ?? null,
        timestamp: new Date().toISOString(),
        ...payload,
      } as never,
    });
  } catch (e) {
    console.error("[audit] insert failed", e);
  }
}

async function recordExecution(input: {
  ctx: ExecContext;
  tool: ToolName;
  risk: "safe" | "restricted" | "dangerous";
  summary: string;
  status: "pending" | "running" | "success" | "error" | "rejected";
  payload: Record<string, unknown>;
  result?: unknown;
  error?: string | null;
  approvalId?: string | null;
  serverId?: string | null;
  executionId?: string | null;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      approval_id: input.approvalId ?? null,
      conversation_id: input.ctx.conversationId,
      workspace_id: input.ctx.workspaceId ?? null,
      server_id: input.serverId ?? null,
      user_id: input.ctx.userId,
      tool_name: input.tool,
      risk_level: input.risk,
      adapter_mode: input.ctx.adapterMode,
      status: input.status,
      input_summary: input.summary,
      payload: input.payload as never,
      result: input.result === undefined ? null : (input.result as never),
      error: input.error ?? null,
      finished_at: ["success", "error", "rejected"].includes(input.status)
        ? new Date().toISOString()
        : null,
    };
    if (input.executionId) {
      await supabaseAdmin.from("tool_executions").update(row).eq("id", input.executionId);
      return input.executionId;
    }
    if (input.approvalId && input.status !== "pending") {
      const { data: existing } = await supabaseAdmin
        .from("tool_executions")
        .select("id")
        .eq("approval_id", input.approvalId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const existingId = (existing as { id?: string } | null)?.id;
      if (existingId) {
        await supabaseAdmin.from("tool_executions").update(row).eq("id", existingId);
        return existingId;
      }
    }
    const { data } = await supabaseAdmin.from("tool_executions").insert(row).select("id").single();
    return (data as { id?: string } | null)?.id ?? null;
  } catch (e) {
    console.error("[tool_executions] write failed", e);
    return null;
  }
}

async function notify(opts: {
  userId?: string | null;
  title: string;
  body?: string;
  severity?: "info" | "warning" | "error" | "success";
  link?: string;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("notifications").insert({
      user_id: opts.userId ?? null,
      title: opts.title,
      body: opts.body ?? null,
      severity: opts.severity ?? "info",
      link: opts.link ?? null,
    });
  } catch (e) {
    console.error("[notify] insert failed", e);
  }
}

export async function executeTool(
  tool: ToolName,
  input: Record<string, unknown>,
  ctx: ExecContext,
): Promise<ToolResult> {
  const { risk, reason } = classifyRisk({ tool, input });
  const summary = summarizeInput(tool, input);

  if (risk === "safe") {
    const result = await runSafe(tool, input, ctx, summary);
    await audit(ctx, `tool.${tool}`, "executor", {
      risk,
      summary,
      mode: ctx.adapterMode,
      ok: result.ok,
    });
    return result;
  }

  // Restricted / dangerous → queue an approval row, do NOT execute.
  const { data: approval, error } = await ctx.supabase
    .from("approvals")
    .insert({
      requested_by: ctx.userId,
      workspace_id: ctx.workspaceId ?? null,
      conversation_id: ctx.conversationId,
      action: tool,
      tool_name: tool,
      risk_level: risk,
      input_summary: summary,
      payload: input,
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    console.error("[executor] approval insert failed", error);
    return {
      ok: false,
      pending: true,
      mode: ctx.adapterMode,
      risk,
      summary,
      note: `Could not enqueue approval: ${error.message}`,
    };
  }

  const executionId = await recordExecution({
    ctx,
    tool,
    risk,
    summary,
    status: "pending",
    payload: input,
    approvalId: approval.id,
  });

  await audit(ctx, `approval.requested`, approval.id, {
    tool,
    risk,
    summary,
    mode: ctx.adapterMode,
    status: "pending",
    approval_id: approval.id,
    execution_id: executionId,
  });
  await notify({
    userId: null, // broadcast to admins; notif RLS allows broadcast rows
    title: `Approval requested: ${tool}`,
    body: `${risk.toUpperCase()} · ${summary}`,
    severity: risk === "dangerous" ? "warning" : "info",
    link: "/approvals",
  });

  return {
    ok: false,
    pending: true,
    approvalId: approval.id,
    executionId: executionId ?? undefined,
    mode: ctx.adapterMode,
    risk,
    summary,
    note: `${reason} Awaiting human approval. Open the Approvals tab to review.`,
  };
}

async function runSafe(
  tool: ToolName,
  input: Record<string, unknown>,
  ctx: ExecContext,
  summary: string,
): Promise<ToolResult> {
  if (tool === "plan") {
    return {
      ok: true,
      mode: ctx.adapterMode,
      risk: "safe",
      summary,
      data: { steps: input.steps },
    };
  }

  if (tool === "web_search") {
    return {
      ok: true,
      mode: ctx.adapterMode,
      risk: "safe",
      summary,
      data: { query: input.query, results: [] },
      note: "Web search provider not yet connected. Reply from existing knowledge and recommend the user verify time-sensitive facts.",
    };
  }

  if (
    ["read_file", "list_files", "search_files", "get_workspace_info", "get_logs"].includes(tool)
  ) {
    if (ctx.adapterMode === "remote-agent") {
      const cfg = await resolveDaemonConfig(ctx.workspaceId);
      if (cfg) return runReadOnlyRemote(tool, cfg, input, ctx, summary);
    }
    return mockOrDryRun(tool, input, ctx, summary, "safe", {
      tool,
      input,
      note: "Configure an enabled linked remote-agent server for real workspace reads.",
    });
  }

  return {
    ok: false,
    mode: ctx.adapterMode,
    risk: "safe",
    summary,
    note: "Unhandled safe tool.",
  };
}

/** Called by the approval resolver when a restricted/dangerous tool is approved. */
export async function executeApproved(
  tool: ToolName,
  input: Record<string, unknown>,
  ctx: ExecContext,
  opts: { approvalId?: string | null } = {},
): Promise<ToolResult> {
  const summary = summarizeInput(tool, input);
  const risk = classifyRisk({ tool, input }).risk;

  // M9 browser-agent path — gated by env config.
  if (isBrowserTool(tool)) {
    const cfg = resolveBrowserAgentConfig();
    if (!cfg) {
      const note =
        "Browser agent is not configured on this deployment. Set BROWSER_AGENT_URL and BROWSER_AGENT_TOKEN to enable.";
      await recordExecution({
        ctx,
        tool,
        risk,
        summary,
        status: "error",
        payload: input,
        error: note,
        approvalId: opts.approvalId ?? null,
      });
      return { ok: false, mode: ctx.adapterMode, risk, summary, note };
    }
    await audit(ctx, "approval.execution_started", opts.approvalId ?? "approved-tool", {
      tool,
      risk,
      summary,
      status: "running",
      target: "browser-agent",
    });
    return runBrowserTool(tool, input, ctx, summary, risk, opts.approvalId ?? null);
  }

  if (ctx.adapterMode === "remote-agent") {
    const cfg = await resolveDaemonConfig(ctx.workspaceId);
    if (!cfg) {
      return {
        ok: false,
        mode: ctx.adapterMode,
        risk,
        summary,
        note: "Remote-agent adapter selected but no enabled server is attached to this workspace.",
      };
    }
    await audit(ctx, "approval.execution_started", opts.approvalId ?? "approved-tool", {
      tool,
      risk,
      summary,
      server_id: cfg.serverId ?? null,
      status: "running",
    });
    if (tool === "run_command") return runExecRemote(cfg, input, ctx, summary, opts.approvalId);
    if (tool === "read_file") return runReadRemote(cfg, input, ctx, summary, opts.approvalId);
    if (tool === "write_file") return runWriteRemote(cfg, input, ctx, summary, opts.approvalId);
    if (tool === "delete_file") return runDeleteRemote(cfg, input, ctx, summary, opts.approvalId);
  }

  return mockOrDryRun(tool, input, ctx, summary, risk, {
    tool,
    input,
    note: "Approval recorded. Configure a remote-agent server in Settings → Servers for real execution.",
  });
}

async function runBrowserTool(
  tool: ToolName,
  input: Record<string, unknown>,
  ctx: ExecContext,
  summary: string,
  risk: "safe" | "restricted" | "dangerous",
  approvalId: string | null,
): Promise<ToolResult> {
  const cfg = resolveBrowserAgentConfig();
  if (!cfg) {
    return {
      ok: false,
      mode: ctx.adapterMode,
      risk,
      summary,
      note: "Browser agent not configured.",
    };
  }
  let r:
    | Awaited<ReturnType<typeof browserNavigate>>
    | Awaited<ReturnType<typeof browserExtract>>
    | Awaited<ReturnType<typeof browserClick>>
    | Awaited<ReturnType<typeof browserFill>>
    | Awaited<ReturnType<typeof browserScreenshot>>;
  if (tool === "browser_navigate") {
    r = await browserNavigate(cfg, {
      url: String(input.url ?? ""),
      waitFor: input.waitFor as "load" | "domcontentloaded" | "networkidle" | undefined,
    });
  } else if (tool === "browser_extract") {
    r = await browserExtract(cfg, {
      selector: typeof input.selector === "string" ? input.selector : undefined,
      format: input.format as "text" | "html" | undefined,
    });
  } else if (tool === "browser_click") {
    r = await browserClick(cfg, { selector: String(input.selector ?? "") });
  } else if (tool === "browser_fill") {
    r = await browserFill(cfg, {
      selector: String(input.selector ?? ""),
      value: String(input.value ?? ""),
    });
  } else if (tool === "browser_screenshot") {
    r = await browserScreenshot(cfg, {
      url: typeof input.url === "string" ? input.url : undefined,
      fullPage: typeof input.fullPage === "boolean" ? input.fullPage : undefined,
    });
  } else {
    return { ok: false, mode: ctx.adapterMode, risk, summary, note: "Unknown browser tool." };
  }
  await audit(ctx, `tool.${tool}.browser`, "browser-agent", { summary, ok: r.ok });
  // Strip large binary fields from stored result.
  const stored =
    tool === "browser_screenshot" && r.ok && r.data
      ? { ...(r.data as Record<string, unknown>), base64: "[stripped]" }
      : r.data;
  await recordExecution({
    ctx,
    tool,
    risk,
    summary,
    status: r.ok ? "success" : "error",
    payload: input,
    result: stored,
    error: r.error ?? null,
    approvalId,
  });
  if (!r.ok) return { ok: false, mode: ctx.adapterMode, risk, summary, note: r.error };
  return { ok: true, mode: ctx.adapterMode, risk, summary, data: stored };
}

async function runReadOnlyRemote(
  tool: ToolName,
  cfg: DaemonConfig,
  input: Record<string, unknown>,
  ctx: ExecContext,
  summary: string,
): Promise<ToolResult> {
  if (tool === "read_file") return runReadRemote(cfg, input, ctx, summary);
  const path = typeof input.path === "string" ? input.path : undefined;
  const query = String(input.query ?? "");
  const commandId = typeof input.commandId === "string" ? input.commandId : undefined;
  const limit = typeof input.limit === "number" ? input.limit : undefined;
  const r =
    tool === "list_files"
      ? await daemonListFiles(cfg, { path, limit })
      : tool === "search_files"
        ? await daemonSearchFiles(cfg, { query, path, limit })
        : tool === "get_workspace_info"
          ? await daemonWorkspaceInfo(cfg)
          : await daemonLogs(cfg, { commandId, limit });
  await audit(ctx, `tool.${tool}.remote`, "daemon", {
    summary,
    ok: r.ok,
    server_id: cfg.serverId ?? null,
  });
  await recordExecution({
    ctx,
    tool,
    risk: "safe",
    summary,
    status: r.ok ? "success" : "error",
    payload: input,
    result: r.data,
    error: r.error ?? null,
    serverId: cfg.serverId ?? null,
  });
  if (!r.ok) return { ok: false, mode: "remote-agent", risk: "safe", summary, note: r.error };
  return { ok: true, mode: "remote-agent", risk: "safe", summary, data: r.data };
}

async function runExecRemote(
  cfg: DaemonConfig,
  input: Record<string, unknown>,
  ctx: ExecContext,
  summary: string,
  approvalId?: string | null,
): Promise<ToolResult> {
  await recordExecution({
    ctx,
    tool: "run_command",
    risk: "restricted",
    summary,
    status: "running",
    payload: input,
    serverId: cfg.serverId ?? null,
    approvalId,
  });
  const r = await daemonExec(cfg, {
    command: String(input.command ?? ""),
    cwd: typeof input.cwd === "string" ? input.cwd : undefined,
    timeoutMs: typeof input.timeoutMs === "number" ? input.timeoutMs : undefined,
  });
  await audit(ctx, "tool.run_command.remote", "daemon", {
    summary,
    ok: r.ok,
    status: r.status,
    server_id: cfg.serverId ?? null,
    exitCode: r.data?.exitCode,
  });
  await recordExecution({
    ctx,
    tool: "run_command",
    risk: "restricted",
    summary,
    status: r.ok ? "success" : "error",
    payload: input,
    result: r.data,
    error: r.error ?? null,
    serverId: cfg.serverId ?? null,
    approvalId,
  });
  if (!r.ok) {
    return { ok: false, mode: "remote-agent", risk: "restricted", summary, note: r.error };
  }
  return { ok: true, mode: "remote-agent", risk: "restricted", summary, data: r.data };
}

async function runReadRemote(
  cfg: DaemonConfig,
  input: Record<string, unknown>,
  ctx: ExecContext,
  summary: string,
  approvalId?: string | null,
): Promise<ToolResult> {
  const r = await daemonReadFile(cfg, { path: String(input.path ?? "") });
  await audit(ctx, "tool.read_file.remote", "daemon", {
    summary,
    ok: r.ok,
    server_id: cfg.serverId ?? null,
  });
  await recordExecution({
    ctx,
    tool: "read_file",
    risk: classifyRisk({ tool: "read_file", input }).risk,
    summary,
    status: r.ok ? "success" : "error",
    payload: input,
    result: r.data,
    error: r.error ?? null,
    serverId: cfg.serverId ?? null,
    approvalId,
  });
  if (!r.ok) return { ok: false, mode: "remote-agent", risk: "safe", summary, note: r.error };
  return { ok: true, mode: "remote-agent", risk: "safe", summary, data: r.data };
}

async function runWriteRemote(
  cfg: DaemonConfig,
  input: Record<string, unknown>,
  ctx: ExecContext,
  summary: string,
  approvalId?: string | null,
): Promise<ToolResult> {
  const r = await daemonWriteFile(cfg, {
    path: String(input.path ?? ""),
    content: String(input.content ?? ""),
  });
  await audit(ctx, "tool.write_file.remote", "daemon", {
    summary,
    ok: r.ok,
    server_id: cfg.serverId ?? null,
  });
  await recordExecution({
    ctx,
    tool: "write_file",
    risk: "restricted",
    summary,
    status: r.ok ? "success" : "error",
    payload: { ...input, content: String(input.content ?? "").slice(0, 4000) },
    result: r.data,
    error: r.error ?? null,
    serverId: cfg.serverId ?? null,
    approvalId,
  });
  if (!r.ok) return { ok: false, mode: "remote-agent", risk: "restricted", summary, note: r.error };
  return { ok: true, mode: "remote-agent", risk: "restricted", summary, data: r.data };
}

async function runDeleteRemote(
  cfg: DaemonConfig,
  input: Record<string, unknown>,
  ctx: ExecContext,
  summary: string,
  approvalId?: string | null,
): Promise<ToolResult> {
  const r = await daemonDeleteFile(cfg, { path: String(input.path ?? "") });
  await audit(ctx, "tool.delete_file.remote", "daemon", {
    summary,
    ok: r.ok,
    server_id: cfg.serverId ?? null,
  });
  await recordExecution({
    ctx,
    tool: "delete_file",
    risk: "restricted",
    summary,
    status: r.ok ? "success" : "error",
    payload: input,
    result: r.data,
    error: r.error ?? null,
    serverId: cfg.serverId ?? null,
    approvalId,
  });
  if (!r.ok) return { ok: false, mode: "remote-agent", risk: "restricted", summary, note: r.error };
  return { ok: true, mode: "remote-agent", risk: "restricted", summary, data: r.data };
}

function mockOrDryRun(
  tool: ToolName,
  input: Record<string, unknown>,
  ctx: ExecContext,
  summary: string,
  risk: "safe" | "restricted" | "dangerous",
  payload: unknown,
): ToolResult {
  const mode = ctx.adapterMode;
  if (mode === "dry-run") {
    return {
      ok: true,
      mode,
      risk,
      summary,
      data: { dryRun: true, would: { tool, input } },
      note: "Dry-run mode — no side effects performed.",
    };
  }
  if (mode === "ssh" || mode === "self-hosted-local") {
    return {
      ok: false,
      pending: true,
      mode,
      risk,
      summary,
      note:
        mode === "ssh"
          ? "SSH adapter is not implemented yet. Switch the server to remote-agent or mock."
          : "self-hosted-local adapter is staged but disabled. Real execution requires running the app on a VPS with an explicit local runner enable flag (M5).",
    };
  }
  return {
    ok: true,
    mode,
    risk,
    summary,
    data: payload,
    note: "Mock adapter — no real workspace touched.",
  };
}
