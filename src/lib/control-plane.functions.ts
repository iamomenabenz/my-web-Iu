// Control-plane server functions for M4B: per-section CRUD + audit-log
// enrichment for databases, storage, API integrations, and workspaces.
// Secret columns are write-only from the frontend — SELECT grants exclude
// them; we never echo them back.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";

async function assertAdmin(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

async function audit(
  userId: string,
  action: string,
  target: string,
  payload: Record<string, unknown>,
) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_log").insert({
      actor: userId,
      action,
      target,
      payload: payload as never,
    });
  } catch (e) {
    console.error("[audit] insert failed", e);
  }
}

const idInput = z.object({ id: z.string().uuid() });

/* ------------------------------ Databases ------------------------------ */

const dbSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  db_type: z.enum(["supabase", "postgres", "neon", "rds", "mysql", "custom"]),
  connection_url: z.string().min(1).max(4096).optional(),
  secret_ref: z.string().max(255).optional().nullable(),
  enabled: z.boolean().default(false),
});

export const listDatabases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("database_connections")
      .select(
        "id, name, db_type, secret_ref, enabled, last_validated_at, last_validation_status, last_validation_error, created_at, updated_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { databases: data ?? [] };
  });

export const upsertDatabase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => dbSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row: Record<string, unknown> = {
      name: data.name,
      db_type: data.db_type,
      enabled: data.enabled,
      secret_ref: data.secret_ref ?? null,
      created_by: context.userId,
    };
    if (data.connection_url) row.connection_url = data.connection_url;
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("database_connections")
        .update(row as never)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      await audit(context.userId, "database.update", data.id, {
        name: data.name,
        enabled: data.enabled,
      });
      return { id: data.id };
    }
    const { data: ins, error } = await supabaseAdmin
      .from("database_connections")
      .insert(row as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await audit(context.userId, "database.create", ins.id, {
      name: data.name,
      db_type: data.db_type,
    });
    return { id: ins.id };
  });

export const deleteDatabase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => idInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("database_connections").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context.userId, "database.delete", data.id, {});
    return { ok: true };
  });

export const testDatabase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => idInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("database_connections")
      .select("connection_url, secret_ref")
      .eq("id", data.id)
      .single();
    const url = row?.connection_url || (row?.secret_ref ? process.env[row.secret_ref] : undefined);
    let status = "untested";
    let err: string | null = null;
    if (!url) {
      status = "missing_url";
      err = "No connection URL configured.";
    } else if (!/^postgres(ql)?:\/\//i.test(url) && !/^mysql:\/\//i.test(url)) {
      status = "invalid_url";
      err = "Connection URL must start with postgres://, postgresql://, or mysql://";
    } else {
      status = "format_ok";
      err = "Validated URL format only. A real TCP probe runs via remote-agent in M5.";
    }
    await supabaseAdmin
      .from("database_connections")
      .update({
        last_validated_at: new Date().toISOString(),
        last_validation_status: status,
        last_validation_error: err,
      })
      .eq("id", data.id);
    await audit(context.userId, "database.test", data.id, { status, error: err });
    return { ok: status === "format_ok", status, error: err };
  });

/* ------------------------------ Storage ------------------------------ */

const storageSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  provider_type: z.enum(["supabase", "s3", "r2", "vercel-blob", "local", "custom-s3"]),
  bucket: z.string().max(255).optional().nullable(),
  region: z.string().max(64).optional().nullable(),
  endpoint: z.string().max(1024).optional().nullable(),
  access_key_id: z.string().max(1024).optional(),
  secret_access_key: z.string().max(4096).optional(),
  secret_ref: z.string().max(255).optional().nullable(),
  is_default: z.boolean().default(false),
  enabled: z.boolean().default(false),
});

export const listStorage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("storage_backends")
      .select(
        "id, name, provider_type, bucket, region, endpoint, secret_ref, is_default, enabled, last_validated_at, last_validation_status, last_validation_error, created_at, updated_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { storage: data ?? [] };
  });

export const upsertStorage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => storageSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row: Record<string, unknown> = {
      name: data.name,
      provider_type: data.provider_type,
      bucket: data.bucket ?? null,
      region: data.region ?? null,
      endpoint: data.endpoint ?? null,
      secret_ref: data.secret_ref ?? null,
      is_default: data.is_default,
      enabled: data.enabled,
      created_by: context.userId,
    };
    if (data.access_key_id) row.access_key_id = data.access_key_id;
    if (data.secret_access_key) row.secret_access_key = data.secret_access_key;
    if (data.is_default) {
      // ensure only one default
      await supabaseAdmin
        .from("storage_backends")
        .update({ is_default: false } as never)
        .neq("id", data.id ?? "00000000-0000-0000-0000-000000000000");
    }
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("storage_backends")
        .update(row as never)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      await audit(context.userId, "storage.update", data.id, {
        name: data.name,
        enabled: data.enabled,
        is_default: data.is_default,
      });
      return { id: data.id };
    }
    const { data: ins, error } = await supabaseAdmin
      .from("storage_backends")
      .insert(row as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await audit(context.userId, "storage.create", ins.id, {
      name: data.name,
      provider_type: data.provider_type,
    });
    return { id: ins.id };
  });

export const setDefaultStorage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => idInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("storage_backends")
      .update({ is_default: false } as never)
      .neq("id", data.id);
    const { error } = await supabaseAdmin
      .from("storage_backends")
      .update({ is_default: true } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context.userId, "storage.set_default", data.id, {});
    return { ok: true };
  });

export const deleteStorage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => idInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("storage_backends").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context.userId, "storage.delete", data.id, {});
    return { ok: true };
  });

export const testStorage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => idInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("storage_backends")
      .select("provider_type, bucket, endpoint")
      .eq("id", data.id)
      .single();
    let status = "untested";
    let err: string | null = null;
    if (!row?.bucket && row?.provider_type !== "local") {
      status = "missing_bucket";
      err = "Bucket name required.";
    } else {
      status = "config_ok";
      err = "Validated config shape only. A real bucket probe runs via remote-agent in M5.";
    }
    await supabaseAdmin
      .from("storage_backends")
      .update({
        last_validated_at: new Date().toISOString(),
        last_validation_status: status,
        last_validation_error: err,
      })
      .eq("id", data.id);
    await audit(context.userId, "storage.test", data.id, { status, error: err });
    return { ok: status === "config_ok", status, error: err };
  });

/* ------------------------------ API Integrations ------------------------------ */

const apiSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  base_url: z.string().url().max(1024),
  auth_type: z.enum(["none", "bearer", "api-key", "basic", "custom-header"]).default("none"),
  auth_header_name: z.string().max(128).optional().nullable(),
  auth_token: z.string().max(4096).optional(),
  secret_ref: z.string().max(255).optional().nullable(),
  enabled: z.boolean().default(false),
  allow_agent_use: z.boolean().default(false),
  description: z.string().max(500).optional().nullable(),
});

export const listIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("api_integrations")
      .select(
        "id, name, base_url, auth_type, auth_header_name, secret_ref, enabled, allow_agent_use, description, last_validated_at, last_validation_status, last_validation_error, created_at, updated_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { integrations: data ?? [] };
  });

export const upsertIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => apiSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row: Record<string, unknown> = {
      name: data.name,
      base_url: data.base_url,
      auth_type: data.auth_type,
      auth_header_name: data.auth_header_name ?? null,
      secret_ref: data.secret_ref ?? null,
      enabled: data.enabled,
      allow_agent_use: data.allow_agent_use,
      description: data.description ?? null,
      created_by: context.userId,
    };
    if (data.auth_token) row.auth_token = data.auth_token;
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("api_integrations")
        .update(row as never)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      await audit(context.userId, "integration.update", data.id, {
        name: data.name,
        enabled: data.enabled,
        allow_agent_use: data.allow_agent_use,
      });
      return { id: data.id };
    }
    const { data: ins, error } = await supabaseAdmin
      .from("api_integrations")
      .insert(row as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await audit(context.userId, "integration.create", ins.id, {
      name: data.name,
      base_url: data.base_url,
    });
    return { id: ins.id };
  });

export const deleteIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => idInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("api_integrations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context.userId, "integration.delete", data.id, {});
    return { ok: true };
  });

export const testIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => idInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("api_integrations")
      .select("base_url, auth_type, auth_header_name, auth_token, secret_ref")
      .eq("id", data.id)
      .single();
    let status = "untested";
    let err: string | null = null;
    if (!row) {
      status = "missing";
      err = "Integration not found.";
    } else {
      try {
        const headers: Record<string, string> = { accept: "application/json" };
        const token = row.auth_token || (row.secret_ref ? process.env[row.secret_ref] : undefined);
        if (row.auth_type === "bearer" && token) headers.authorization = `Bearer ${token}`;
        else if (row.auth_type === "api-key" && row.auth_header_name && token)
          headers[row.auth_header_name] = token;
        else if (row.auth_type === "custom-header" && row.auth_header_name && token)
          headers[row.auth_header_name] = token;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8_000);
        const res = await fetch(row.base_url, { method: "GET", headers, signal: ctrl.signal });
        clearTimeout(t);
        status = res.ok ? "online" : `http_${res.status}`;
        if (!res.ok) err = `Endpoint returned HTTP ${res.status}`;
      } catch (e) {
        status = "unreachable";
        err = e instanceof Error ? e.message : "Network error";
      }
    }
    await supabaseAdmin
      .from("api_integrations")
      .update({
        last_validated_at: new Date().toISOString(),
        last_validation_status: status,
        last_validation_error: err,
      })
      .eq("id", data.id);
    await audit(context.userId, "integration.test", data.id, { status, error: err });
    return { ok: status === "online", status, error: err };
  });

/* ------------------------------ Workspaces ------------------------------ */

const wsSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  path: z.string().min(1).max(1024),
  server_id: z.string().uuid().nullable().optional(),
  allowed_paths: z.array(z.string().min(1).max(1024)).max(64).default([]),
  default_branch: z.string().max(120).optional().nullable(),
  repo_url: z.string().max(1024).optional().nullable(),
  file_access_policy: z.enum(["view-only", "safe", "restricted", "full"]).default("restricted"),
  command_permission_level: z
    .enum([
      "view-only",
      "safe",
      "restricted-with-approval",
      "dangerous-blocked",
      "dangerous-with-approval",
    ])
    .default("restricted-with-approval"),
  active_provider_id: z.string().uuid().nullable().optional(),
  active_storage_id: z.string().uuid().nullable().optional(),
  active_database_id: z.string().uuid().nullable().optional(),
});

export const listWorkspaces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("workspaces")
      .select(
        "id, name, path, server_id, allowed_paths, default_branch, repo_url, file_access_policy, command_permission_level, active_provider_id, active_storage_id, active_database_id, created_at, updated_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { workspaces: data ?? [] };
  });

export const upsertWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => wsSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      name: data.name,
      path: data.path,
      server_id: data.server_id ?? null,
      allowed_paths: data.allowed_paths,
      default_branch: data.default_branch ?? null,
      repo_url: data.repo_url ?? null,
      file_access_policy: data.file_access_policy,
      command_permission_level: data.command_permission_level,
      active_provider_id: data.active_provider_id ?? null,
      active_storage_id: data.active_storage_id ?? null,
      active_database_id: data.active_database_id ?? null,
      created_by: context.userId,
    };
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("workspaces")
        .update(row as never)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      await audit(context.userId, "workspace.update", data.id, {
        name: data.name,
        file_access_policy: data.file_access_policy,
        command_permission_level: data.command_permission_level,
      });
      return { id: data.id };
    }
    const { data: ins, error } = await supabaseAdmin
      .from("workspaces")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await audit(context.userId, "workspace.create", ins.id, { name: data.name, path: data.path });
    return { id: ins.id };
  });

export const deleteWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => idInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("workspaces").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context.userId, "workspace.delete", data.id, {});
    return { ok: true };
  });

/* ------------------------------ Audit log ------------------------------ */

export const listAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // RLS lets admins see all, others see own actions.
    const { data, error } = await context.supabase
      .from("audit_log")
      .select("id, action, target, payload, actor, workspace_id, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { entries: data ?? [] };
  });
