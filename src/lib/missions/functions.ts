// M8 mission server functions — exposed to the client.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const permissionEnum = z.enum(["safe", "restricted", "dangerous"]);

const createSchema = z.object({
  goal: z.string().min(4).max(4000),
  title: z.string().min(1).max(200).optional(),
  workspaceId: z.string().uuid().nullable().optional(),
  model: z.string().min(1).max(200).optional(),
  permissionLevel: permissionEnum.optional(),
});

export const createMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const title = data.title?.trim() || data.goal.split(/\n/)[0].slice(0, 80) || "Untitled mission";
    const { data: row, error } = await supabase
      .from("missions")
      .insert({
        user_id: userId,
        workspace_id: data.workspaceId ?? null,
        title,
        goal: data.goal,
        model: data.model ?? "google/gemini-3-flash-preview",
        permission_level: data.permissionLevel ?? "safe",
        status: "pending",
      })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Failed to create mission");
    return { id: row.id };
  });

export const listMissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("missions")
      .select(
        "id, title, status, goal, model, permission_level, created_at, updated_at, finished_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { missions: data ?? [] };
  });

export const getMission = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: mission, error } = await context.supabase
      .from("missions")
      .select(
        "id, title, status, goal, model, permission_level, workspace_id, final_summary, error, created_at, updated_at, finished_at",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!mission) throw new Error("Mission not found");

    const { data: steps, error: stepsErr } = await context.supabase
      .from("mission_steps")
      .select(
        "id, step_number, title, tool_name, status, planned_action, input_summary, output_summary, approval_id, tool_execution_id, error, created_at, finished_at",
      )
      .eq("mission_id", data.id)
      .order("step_number", { ascending: true });
    if (stepsErr) throw new Error(stepsErr.message);

    return { mission, steps: steps ?? [] };
  });

export const startMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // Ownership check via RLS-bound client.
    const { data: own, error: ownErr } = await context.supabase
      .from("missions")
      .select("id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (ownErr || !own) throw new Error("Forbidden");
    const { planMission, tickMission } = await import("./runner.server");
    const plan = await planMission(data.id);
    if (!plan.ok) return { ok: false, error: plan.error };
    const tick = await tickMission(data.id);
    return { ok: true, status: tick.status, note: tick.note };
  });

export const tickMissionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: own, error: ownErr } = await context.supabase
      .from("missions")
      .select("id")
      .eq("id", data.id)
      .maybeSingle();
    if (ownErr || !own) throw new Error("Forbidden");
    const { tickMission } = await import("./runner.server");
    return tickMission(data.id);
  });

export const cancelMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("missions")
      .update({ status: "cancelled", finished_at: new Date().toISOString() })
      .eq("id", data.id)
      .in("status", ["pending", "planning", "running", "waiting_for_approval", "paused"]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const pauseMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("missions")
      .update({ status: "paused" })
      .eq("id", data.id)
      .in("status", ["running", "waiting_for_approval"]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
