// Health / readiness checks for the production dashboard.
// All checks are admin-only and run server-side so secrets never leak.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  isBrowserAgentEnabled,
  resolveBrowserAgentConfig,
  browserHealth,
} from "@/lib/tools/browser-agent.server";

export interface HealthCheck {
  id: string;
  label: string;
  status: "ok" | "warn" | "fail" | "disabled";
  detail?: string;
}

async function assertAdmin(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export const getSystemHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const checks: HealthCheck[] = [];

    // 1. App itself — if this fn ran, the SSR runtime is alive.
    checks.push({ id: "app", label: "Web app", status: "ok", detail: "SSR responding" });

    // 2. Supabase reachability (we already authenticated; ping a table).
    try {
      const { error } = await context.supabase
        .from("user_roles")
        .select("user_id", { count: "exact", head: true });
      checks.push({
        id: "supabase",
        label: "Database (Supabase)",
        status: error ? "fail" : "ok",
        detail: error?.message,
      });
    } catch (e) {
      checks.push({
        id: "supabase",
        label: "Database (Supabase)",
        status: "fail",
        detail: e instanceof Error ? e.message : String(e),
      });
    }

    // 3. Model provider — Lovable AI gateway key or fallback provider.
    const hasLovable = Boolean(process.env.LOVABLE_API_KEY);
    const hasFallback = Boolean(
      process.env.OPENAI_API_KEY ||
        process.env.ANTHROPIC_API_KEY ||
        process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
        process.env.OPENROUTER_API_KEY,
    );
    checks.push({
      id: "model",
      label: "Model provider",
      status: hasLovable || hasFallback ? "ok" : "warn",
      detail: hasLovable
        ? "Lovable AI gateway configured"
        : hasFallback
          ? "Fallback provider key set"
          : "No provider key found",
    });

    // 4. Server-agent — count enabled rows.
    try {
      const { data, error } = await context.supabase
        .from("servers")
        .select("id, enabled, status, last_health_at")
        .eq("enabled", true);
      if (error) throw error;
      const rows = data ?? [];
      const healthy = rows.filter((r) => r.status === "online" || r.status === "ok").length;
      checks.push({
        id: "server-agent",
        label: "Server-agent",
        status: rows.length === 0 ? "warn" : healthy === rows.length ? "ok" : "warn",
        detail:
          rows.length === 0
            ? "No server registered — add one in Settings → Servers"
            : `${healthy}/${rows.length} healthy`,
      });
    } catch (e) {
      checks.push({
        id: "server-agent",
        label: "Server-agent",
        status: "fail",
        detail: e instanceof Error ? e.message : String(e),
      });
    }

    // 5. Browser-agent — disabled by default; ping if configured.
    if (!isBrowserAgentEnabled()) {
      checks.push({
        id: "browser-agent",
        label: "Browser-agent",
        status: "disabled",
        detail: "Disabled — set BROWSER_AGENT_URL + BROWSER_AGENT_TOKEN to enable",
      });
    } else {
      const cfg = resolveBrowserAgentConfig();
      if (!cfg) {
        checks.push({
          id: "browser-agent",
          label: "Browser-agent",
          status: "fail",
          detail: "Configuration could not be resolved",
        });
      } else {
        const res = await browserHealth(cfg);
        checks.push({
          id: "browser-agent",
          label: "Browser-agent",
          status: res.ok ? "ok" : "fail",
          detail: res.ok ? `version ${res.data?.version ?? "?"}` : res.error,
        });
      }
    }

    // 6. Approval mode — must require for restricted/dangerous.
    checks.push({
      id: "approvals",
      label: "Approvals",
      status: "ok",
      detail: "restricted + dangerous require human approval",
    });

    return { checks, at: new Date().toISOString() };
  });
