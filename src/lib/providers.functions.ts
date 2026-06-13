import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ProviderKind = z.enum(["openai", "anthropic", "google", "openrouter", "ollama", "custom"]);

const UpsertInput = z.object({
  id: z.string().uuid().optional(),
  kind: ProviderKind,
  name: z.string().min(1).max(64),
  api_key: z.string().min(1).max(8192).optional(),
  base_url: z.string().url().max(512).optional().nullable(),
  default_model: z.string().max(128).optional().nullable(),
  enabled: z.boolean().optional(),
});

// List provider configs (admin-managed, shared). API keys are never returned.
export const listProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("provider_configs")
      .select(
        "id, kind, name, base_url, default_model, enabled, models, last_validated_at, last_validation_status, last_validation_error, created_at, updated_at",
      )
      .order("name");
    if (error) throw new Error(error.message);
    return { providers: data ?? [] };
  });

export const upsertProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpsertInput.parse(input))
  .handler(async ({ data, context }) => {
    const row: {
      id?: string;
      kind: z.infer<typeof ProviderKind>;
      name: string;
      base_url: string | null;
      default_model: string | null;
      enabled: boolean;
      api_key_encrypted?: string;
      created_by: string;
    } = {
      kind: data.kind,
      name: data.name,
      base_url: data.base_url ?? null,
      default_model: data.default_model ?? null,
      enabled: data.enabled ?? true,
      created_by: context.userId,
    };
    if (data.id) row.id = data.id;
    if (data.api_key) row.api_key_encrypted = data.api_key;

    const { error } = await context.supabase.from("provider_configs").upsert(row);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("provider_configs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Validate a provider's API key by hitting a list-models endpoint where possible.
export const testProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: roleData } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!roleData) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("provider_configs")
      .select("kind, base_url, api_key_encrypted")
      .eq("id", data.id)
      .single();
    if (!row) throw new Error("Provider not found");

    const key = row.api_key_encrypted ?? "";
    let status = "untested";
    let err: string | null = null;
    let models: string[] = [];

    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10_000);
      const headers: Record<string, string> = { accept: "application/json" };
      let url: string | null = null;

      if (row.kind === "openai") {
        url = (row.base_url || "https://api.openai.com/v1") + "/models";
        if (key) headers.authorization = `Bearer ${key}`;
      } else if (row.kind === "openrouter") {
        url = (row.base_url || "https://openrouter.ai/api/v1") + "/models";
        if (key) headers.authorization = `Bearer ${key}`;
      } else if (row.kind === "anthropic") {
        url = (row.base_url || "https://api.anthropic.com/v1") + "/models";
        if (key) headers["x-api-key"] = key;
        headers["anthropic-version"] = "2023-06-01";
      } else if (row.kind === "google") {
        url =
          (row.base_url || "https://generativelanguage.googleapis.com/v1beta") +
          "/models?key=" +
          encodeURIComponent(key);
      } else if (row.kind === "ollama") {
        url = (row.base_url || "http://localhost:11434") + "/api/tags";
      } else {
        url = (row.base_url || "") + "/models";
        if (key) headers.authorization = `Bearer ${key}`;
      }

      if (!url || (!key && row.kind !== "ollama")) {
        status = "missing_key";
        err = "Provider key not configured.";
      } else {
        const res = await fetch(url, { method: "GET", headers, signal: ctrl.signal });
        clearTimeout(t);
        if (res.ok) {
          status = "ok";
          try {
            const json = (await res.json()) as {
              data?: { id: string }[];
              models?: { name: string }[];
            };
            models = (json.data?.map((m) => m.id) ?? json.models?.map((m) => m.name) ?? []).slice(
              0,
              50,
            );
          } catch {
            /* ignore */
          }
        } else {
          status = `http_${res.status}`;
          err = `Provider returned HTTP ${res.status}`;
        }
      }
    } catch (e) {
      status = "unreachable";
      err = e instanceof Error ? e.message : "Network error";
    }

    await supabaseAdmin
      .from("provider_configs")
      .update({
        last_validated_at: new Date().toISOString(),
        last_validation_status: status,
        last_validation_error: err,
        ...(models.length > 0 ? { models } : {}),
      })
      .eq("id", data.id);

    try {
      await supabaseAdmin.from("audit_log").insert({
        actor: context.userId,
        action: "provider.test",
        target: data.id,
        payload: { status, error: err, model_count: models.length } as never,
      });
    } catch (e) {
      console.error("[audit] provider.test insert failed", e);
    }

    return { ok: status === "ok", status, error: err, models };
  });
