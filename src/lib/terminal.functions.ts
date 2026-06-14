import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { executeTool, type AdapterMode } from "@/lib/tools/executor.server";

async function resolveAdapter(workspaceId: string | null | undefined): Promise<AdapterMode> {
  if (!workspaceId) return "mock";
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("server_id")
    .eq("id", workspaceId)
    .maybeSingle();
  const serverId = (ws as { server_id?: string | null } | null)?.server_id;
  if (!serverId) return "mock";
  const { data: srv } = await supabaseAdmin
    .from("servers")
    .select("enabled, adapter_mode")
    .eq("id", serverId)
    .maybeSingle();
  const s = srv as { enabled?: boolean | null; adapter_mode?: string | null } | null;
  return s?.enabled && s.adapter_mode ? (s.adapter_mode as AdapterMode) : "mock";
}

export const runTerminalCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid().nullable().optional(),
        command: z.string().min(1).max(2000),
        cwd: z.string().max(1024).optional(),
        timeoutMs: z.number().int().min(1000).max(300000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const adapterMode = await resolveAdapter(data.workspaceId);
    const result = await executeTool("run_command", data, {
      supabase: context.supabase,
      userId: context.userId,
      conversationId: null,
      workspaceId: data.workspaceId,
      adapterMode,
    });
    return {
      ok: result.ok,
      pending: result.pending ?? false,
      approvalId: result.approvalId ?? null,
      executionId: result.executionId ?? null,
      mode: result.mode,
      risk: result.risk,
      summary: result.summary,
      note: result.note ?? null,
      dataJson: result.data === undefined ? null : JSON.stringify(result.data),
    };
  });

export const listTerminalExecutions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ workspaceId: z.string().uuid().nullable().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("tool_executions")
      .select("id, tool_name, status, input_summary, result, error, created_at, finished_at")
      .eq("tool_name", "run_command")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data.workspaceId) q = q.eq("workspace_id", data.workspaceId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { executions: rows ?? [] };
  });
