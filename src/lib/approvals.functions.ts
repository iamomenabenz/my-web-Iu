// Approval queue server functions. On approve, executes the queued tool via
// the workspace's configured adapter and records audit + notification rows.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { executeApproved, type AdapterMode } from "@/lib/tools/executor.server";
import type { ToolName } from "@/lib/tools/risk";

const idSchema = z.object({ id: z.string().uuid() });

export const listApprovals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { status?: "pending" | "resolved" } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("approvals")
      .select(
        "id, requested_by, workspace_id, conversation_id, action, tool_name, risk_level, input_summary, payload, status, decided_by, decided_at, created_at, expires_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (data?.status === "pending") q = q.eq("status", "pending");
    else if (data?.status === "resolved") q = q.in("status", ["approved", "denied", "expired"]);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { approvals: rows ?? [] };
  });

export const resolveApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; decision: "approved" | "denied" }) =>
    z.object({ id: z.string().uuid(), decision: z.enum(["approved", "denied"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Load the approval first so we know what to execute on approve.
    const { data: row, error: loadErr } = await supabase
      .from("approvals")
      .select(
        "id, status, tool_name, action, risk_level, input_summary, payload, workspace_id, conversation_id, requested_by",
      )
      .eq("id", data.id)
      .single();
    if (loadErr || !row) throw new Error(loadErr?.message ?? "Approval not found");
    if (row.status !== "pending") {
      return { ok: false, note: "Approval already resolved." };
    }

    const { error } = await supabase
      .from("approvals")
      .update({
        status: data.decision,
        decided_by: userId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("status", "pending");
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Audit the decision.
    await supabaseAdmin.from("audit_log").insert({
      actor: userId,
      workspace_id: row.workspace_id ?? null,
      action: `approval.${data.decision}`,
      target: row.id,
      approved_by: userId,
      payload: { tool: row.tool_name ?? row.action } as never,
    });

    // Notify the requester.
    await supabaseAdmin.from("notifications").insert({
      user_id: row.requested_by,
      title: `Approval ${data.decision}: ${row.tool_name ?? row.action}`,
      severity: data.decision === "approved" ? "success" : "warning",
      link: "/approvals",
    });

    if (data.decision !== "approved") {
      await supabaseAdmin.from("tool_executions").insert({
        approval_id: row.id,
        conversation_id: row.conversation_id,
        workspace_id: row.workspace_id ?? null,
        user_id: row.requested_by,
        tool_name: row.tool_name ?? row.action,
        risk_level: row.risk_level ?? "restricted",
        adapter_mode: "mock",
        status: "rejected",
        input_summary: row.input_summary,
        payload: (row.payload ?? {}) as never,
        error: "Approval rejected; tool was not executed.",
        finished_at: new Date().toISOString(),
      });
      return { ok: true };
    }

    // Resolve adapter mode for execution.
    let adapterMode: AdapterMode = "mock";
    if (row.workspace_id) {
      const { data: ws } = await supabaseAdmin
        .from("workspaces")
        .select("server_id")
        .eq("id", row.workspace_id)
        .maybeSingle();
      const serverId = (ws as { server_id?: string | null } | null)?.server_id;
      if (serverId) {
        const { data: srv } = await supabaseAdmin
          .from("servers")
          .select("adapter_mode, enabled")
          .eq("id", serverId)
          .maybeSingle();
        const s = srv as { adapter_mode?: string | null; enabled?: boolean | null } | null;
        if (s?.enabled && s.adapter_mode) adapterMode = s.adapter_mode as AdapterMode;
      }
    }

    const result = await executeApproved(
      (row.tool_name ?? row.action) as ToolName,
      (row.payload ?? {}) as Record<string, unknown>,
      {
        supabase,
        userId,
        conversationId: row.conversation_id,
        workspaceId: row.workspace_id,
        adapterMode,
      },
      { approvalId: row.id },
    );

    if (row.conversation_id) {
      await supabaseAdmin.from("messages").insert({
        conversation_id: row.conversation_id,
        role: "tool",
        parts: [
          {
            type: "text",
            text: JSON.stringify({
              approvalId: row.id,
              tool: row.tool_name ?? row.action,
              ok: result.ok,
              mode: result.mode,
              risk: result.risk,
              summary: result.summary,
              note: result.note ?? null,
              data: result.data ?? null,
            }),
          },
        ] as never,
      });
    }

    return {
      ok: true,
      executed: {
        ok: result.ok,
        mode: result.mode,
        risk: result.risk,
        summary: result.summary,
        note: result.note ?? null,
        dataJson: result.data === undefined ? null : JSON.stringify(result.data),
      },
    };
  });

export const cancelApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("approvals")
      .update({ status: "denied", decided_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
