// Admin-only server functions for managing server-agent connections and health checks.
// daemon_url/token are never returned to the client.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SAFE_SERVER_COLS =
  "id, name, host, status, last_seen_at, workspace_root, enabled, adapter_mode, last_health_at, created_by, created_at, updated_at";

async function assertAdmin(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export const listServers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("servers")
      .select(SAFE_SERVER_COLS)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { servers: data ?? [] };
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  host: z.string().min(1).max(255),
  daemon_url: z.string().url().max(1024),
  daemon_token: z.string().min(8).max(4096),
  workspace_root: z.string().max(1024).optional().nullable(),
  enabled: z.boolean().default(false),
  adapter_mode: z
    .enum(["mock", "dry-run", "remote-agent", "ssh", "self-hosted-local"])
    .default("mock"),
});

export const upsertServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => upsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      name: data.name,
      host: data.host,
      daemon_url: data.daemon_url,
      daemon_token: data.daemon_token,
      workspace_root: data.workspace_root ?? null,
      enabled: data.enabled,
      adapter_mode: data.adapter_mode,
      created_by: context.userId,
    };
    if (data.id) {
      const { error } = await supabaseAdmin.from("servers").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await supabaseAdmin
      .from("servers")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const deleteServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("servers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const healthCheckServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: srv, error } = await supabaseAdmin
      .from("servers")
      .select("daemon_url, daemon_token, enabled")
      .eq("id", data.id)
      .single();
    if (error || !srv) throw new Error(error?.message ?? "Server not found");
    const { daemonHealth } = await import("@/lib/tools/remote-agent.server");
    if (!srv.daemon_url || !srv.daemon_token) {
      throw new Error("Server is missing daemon URL or token.");
    }
    const res = await daemonHealth({ url: srv.daemon_url, token: srv.daemon_token });
    const status = res.ok ? "online" : "offline";
    await supabaseAdmin
      .from("servers")
      .update({
        status,
        last_health_at: new Date().toISOString(),
        last_seen_at: res.ok ? new Date().toISOString() : undefined,
      })
      .eq("id", data.id);
    await supabaseAdmin.from("audit_log").insert({
      actor: context.userId,
      action: "server.health_check",
      target: data.id,
      payload: { ok: res.ok, status, http_status: res.status, error: res.error ?? null } as never,
    });
    return { ok: res.ok, status, error: res.error, data: res.data };
  });

// Safe smoke test: runs a small, allowlisted set of harmless commands against
// the daemon to verify end-to-end execution. Admin-only. Tokens never leave
// the server. Each step is audited. Does not require per-command approval
// because the command list is fixed and read-only.
const SMOKE_COMMANDS: ReadonlyArray<{ id: string; command: string; label: string }> = [
  { id: "pwd", command: "pwd", label: "Working directory" },
  { id: "ls", command: "ls -la", label: "List workspace" },
  { id: "node", command: "node --version", label: "Node version" },
];

export const smokeTestServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: srv, error } = await supabaseAdmin
      .from("servers")
      .select("daemon_url, daemon_token, enabled, adapter_mode, workspace_root")
      .eq("id", data.id)
      .single();
    if (error || !srv) throw new Error(error?.message ?? "Server not found");
    if (!srv.enabled) throw new Error("Server is disabled. Enable it before running smoke tests.");
    if (srv.adapter_mode !== "remote-agent")
      throw new Error(`Smoke test requires adapter_mode 'remote-agent' (got '${srv.adapter_mode}').`);
    if (!srv.daemon_url || !srv.daemon_token)
      throw new Error("Server is missing daemon URL or token.");

    const { daemonHealth, daemonExec } = await import("@/lib/tools/remote-agent.server");
    const cfg = {
      url: srv.daemon_url,
      token: srv.daemon_token,
      workspaceRoot: srv.workspace_root ?? null,
      timeoutMs: 15_000,
    };

    const health = await daemonHealth(cfg);
    const steps: Array<{
      id: string;
      label: string;
      command?: string;
      ok: boolean;
      exitCode?: number;
      stdout?: string;
      stderr?: string;
      error?: string;
      durationMs?: number;
    }> = [
      {
        id: "health",
        label: "Health check",
        ok: health.ok,
        error: health.error,
        durationMs: undefined,
      },
    ];

    if (health.ok) {
      for (const step of SMOKE_COMMANDS) {
        const res = await daemonExec(cfg, { command: step.command, timeoutMs: 15_000 });
        steps.push({
          id: step.id,
          label: step.label,
          command: step.command,
          ok: res.ok && (res.data?.exitCode ?? 1) === 0,
          exitCode: res.data?.exitCode,
          stdout: res.data?.stdout?.slice(0, 4000),
          stderr: res.data?.stderr?.slice(0, 2000),
          error: res.error,
          durationMs: res.data?.durationMs,
        });
      }
    }

    const allOk = steps.every((s) => s.ok);
    await supabaseAdmin
      .from("servers")
      .update({
        status: health.ok ? "online" : "offline",
        last_health_at: new Date().toISOString(),
        last_seen_at: health.ok ? new Date().toISOString() : undefined,
      })
      .eq("id", data.id);
    await supabaseAdmin.from("audit_log").insert({
      actor: context.userId,
      action: "server.smoke_test",
      target: data.id,
      payload: {
        ok: allOk,
        steps: steps.map((s) => ({
          id: s.id,
          ok: s.ok,
          exitCode: s.exitCode,
          error: s.error ?? null,
        })),
      } as never,
    });

    return { ok: allOk, steps };
  });
