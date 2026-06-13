// Server-only tool executor.
// Adapter modes: mock | dry-run | remote-agent | ssh (ssh still stubbed in M4).
// Restricted/dangerous tools are queued into `approvals`; safe tools run inline.
// All tool activity (queued, executed, denied) is written to `audit_log`.
// Approval lifecycle events also create a `notifications` row.

import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyRisk, summarizeInput, type ToolName } from "./risk";
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
  mode: AdapterMode;
  risk: "safe" | "restricted" | "dangerous";
  summary: string;
  note?: string;
  data?: unknown;
}

async function audit(
  ctx: Pick<ExecContext, "workspaceId" | "userId">,
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
      payload: payload as never,
    });
  } catch (e) {
    console.error("[audit] insert failed", e);
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

  await audit(ctx, `approval.requested`, approval.id, {
    tool,
    risk,
    summary,
    mode: ctx.adapterMode,
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
): Promise<ToolResult> {
  const summary = summarizeInput(tool, input);
  const risk = classifyRisk({ tool, input }).risk;

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
    if (tool === "run_command") return runExecRemote(cfg, input, ctx, summary);
    if (tool === "read_file") return runReadRemote(cfg, input, ctx, summary);
    if (tool === "write_file") return runWriteRemote(cfg, input, ctx, summary);
    if (tool === "delete_file") return runDeleteRemote(cfg, input, ctx, summary);
  }

  return mockOrDryRun(tool, input, ctx, summary, risk, {
    tool,
    input,
    note: "Approval recorded. Configure a remote-agent server in Settings → Servers for real execution.",
  });
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
  await audit(ctx, `tool.${tool}.remote`, "daemon", { summary, ok: r.ok });
  if (!r.ok) return { ok: false, mode: "remote-agent", risk: "safe", summary, note: r.error };
  return { ok: true, mode: "remote-agent", risk: "safe", summary, data: r.data };
}

async function runExecRemote(
  cfg: DaemonConfig,
  input: Record<string, unknown>,
  ctx: ExecContext,
  summary: string,
): Promise<ToolResult> {
  const r = await daemonExec(cfg, {
    command: String(input.command ?? ""),
    cwd: typeof input.cwd === "string" ? input.cwd : undefined,
  });
  await audit(ctx, "tool.run_command.remote", "daemon", {
    summary,
    ok: r.ok,
    status: r.status,
    exitCode: r.data?.exitCode,
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
): Promise<ToolResult> {
  const r = await daemonReadFile(cfg, { path: String(input.path ?? "") });
  await audit(ctx, "tool.read_file.remote", "daemon", { summary, ok: r.ok });
  if (!r.ok) return { ok: false, mode: "remote-agent", risk: "safe", summary, note: r.error };
  return { ok: true, mode: "remote-agent", risk: "safe", summary, data: r.data };
}

async function runWriteRemote(
  cfg: DaemonConfig,
  input: Record<string, unknown>,
  ctx: ExecContext,
  summary: string,
): Promise<ToolResult> {
  const r = await daemonWriteFile(cfg, {
    path: String(input.path ?? ""),
    content: String(input.content ?? ""),
  });
  await audit(ctx, "tool.write_file.remote", "daemon", { summary, ok: r.ok });
  if (!r.ok) return { ok: false, mode: "remote-agent", risk: "restricted", summary, note: r.error };
  return { ok: true, mode: "remote-agent", risk: "restricted", summary, data: r.data };
}

async function runDeleteRemote(
  cfg: DaemonConfig,
  input: Record<string, unknown>,
  ctx: ExecContext,
  summary: string,
): Promise<ToolResult> {
  const r = await daemonDeleteFile(cfg, { path: String(input.path ?? "") });
  await audit(ctx, "tool.delete_file.remote", "daemon", { summary, ok: r.ok });
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
