// M8 mission runner — server-only operator loop.
// Plans a mission with the AI gateway, persists steps, and executes one step at a time
// via the existing executor.server.ts (which already routes risk/approvals/audit).

import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { buildPlannerSystemPrompt, buildPlannerUserPrompt } from "./prompts.server";
import { PERMISSION_TIERS, TOOL_REGISTRY, type PermissionLevel } from "@/lib/tools/registry";
import type { ToolName } from "@/lib/tools/risk";
import { executeTool, type AdapterMode } from "@/lib/tools/executor.server";
import { isBrowserAgentEnabled } from "@/lib/tools/browser-agent.server";

interface MissionRow {
  id: string;
  user_id: string;
  workspace_id: string | null;
  goal: string;
  status: string;
  model: string | null;
  permission_level: string;
}

interface StepPlan {
  title: string;
  tool_name: string;
  input: Record<string, unknown>;
}

async function audit(
  missionId: string,
  userId: string,
  action: string,
  payload: Record<string, unknown>,
) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_log").insert({
      actor: userId,
      action,
      target: missionId,
      payload: { mission_id: missionId, ...payload } as never,
    });
  } catch (e) {
    console.error("[mission audit] failed", e);
  }
}

export async function planMission(missionId: string): Promise<{
  ok: boolean;
  stepCount?: number;
  title?: string;
  error?: string;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: mission, error } = await supabaseAdmin
    .from("missions")
    .select("id, user_id, workspace_id, goal, status, model, permission_level, title")
    .eq("id", missionId)
    .maybeSingle();
  if (error || !mission) return { ok: false, error: error?.message ?? "Mission not found" };
  const m = mission as MissionRow & { title: string };

  await supabaseAdmin.from("missions").update({ status: "planning" }).eq("id", m.id);

  const level = (m.permission_level as PermissionLevel) ?? "safe";
  const model = m.model || "google/gemini-3-flash-preview";

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    await supabaseAdmin
      .from("missions")
      .update({ status: "failed", error: "Missing LOVABLE_API_KEY" })
      .eq("id", m.id);
    return { ok: false, error: "Missing LOVABLE_API_KEY" };
  }
  const gateway = createLovableAiGatewayProvider(apiKey);

  let planJson: { title?: string; steps?: StepPlan[] } | null = null;
  try {
    const { text } = await generateText({
      model: gateway(model),
      system: buildPlannerSystemPrompt(level),
      prompt: buildPlannerUserPrompt(m.goal, m.workspace_id),
    });
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();
    planJson = JSON.parse(cleaned);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabaseAdmin
      .from("missions")
      .update({ status: "failed", error: `Planner error: ${msg}` })
      .eq("id", m.id);
    return { ok: false, error: msg };
  }

  const allowed = new Set<string>(PERMISSION_TIERS[level]);
  const steps = (planJson?.steps ?? [])
    .filter((s) => s && typeof s.tool_name === "string" && allowed.has(s.tool_name))
    .slice(0, 8);

  if (steps.length === 0) {
    await supabaseAdmin
      .from("missions")
      .update({
        status: "failed",
        error: "Planner produced no valid steps for this permission level.",
      })
      .eq("id", m.id);
    return { ok: false, error: "No valid steps planned" };
  }

  const rows = steps.map((s, i) => ({
    mission_id: m.id,
    step_number: i + 1,
    title: String(s.title ?? `Step ${i + 1}`).slice(0, 200),
    planned_action: JSON.stringify(s.input ?? {}).slice(0, 2000),
    tool_name: s.tool_name,
    status: "pending",
    payload: { input: s.input ?? {} } as never,
  }));
  const { error: insErr } = await supabaseAdmin.from("mission_steps").insert(rows);
  if (insErr) {
    await supabaseAdmin
      .from("missions")
      .update({ status: "failed", error: insErr.message })
      .eq("id", m.id);
    return { ok: false, error: insErr.message };
  }

  const title = planJson?.title ? String(planJson.title).slice(0, 200) : m.title;
  await supabaseAdmin.from("missions").update({ title, status: "running" }).eq("id", m.id);
  await audit(m.id, m.user_id, "mission.planned", {
    step_count: rows.length,
    model,
  });
  return { ok: true, stepCount: rows.length, title };
}

async function resolveAdapterMode(workspaceId: string | null): Promise<AdapterMode> {
  if (!workspaceId) return "mock";
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("server_id")
    .eq("id", workspaceId)
    .maybeSingle();
  const sid = (ws as { server_id?: string | null } | null)?.server_id;
  if (!sid) return "mock";
  const { data: srv } = await supabaseAdmin
    .from("servers")
    .select("adapter_mode, enabled")
    .eq("id", sid)
    .maybeSingle();
  const s = srv as { adapter_mode?: string | null; enabled?: boolean | null } | null;
  if (s?.enabled && s.adapter_mode) return s.adapter_mode as AdapterMode;
  return "mock";
}

export async function tickMission(missionId: string): Promise<{
  ok: boolean;
  status: string;
  note?: string;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: mission } = await supabaseAdmin
    .from("missions")
    .select("id, user_id, workspace_id, goal, status, model, permission_level")
    .eq("id", missionId)
    .maybeSingle();
  if (!mission) return { ok: false, status: "not_found" };
  const m = mission as MissionRow;

  if (["success", "failed", "cancelled"].includes(m.status)) {
    return { ok: true, status: m.status, note: "Mission already finished." };
  }
  if (m.status === "paused") return { ok: true, status: m.status, note: "Mission paused." };

  // Find the next actionable step.
  const { data: nextStepData } = await supabaseAdmin
    .from("mission_steps")
    .select("id, step_number, title, tool_name, status, payload, approval_id")
    .eq("mission_id", m.id)
    .in("status", ["pending", "waiting_for_approval"])
    .order("step_number", { ascending: true })
    .limit(1)
    .maybeSingle();
  const next = nextStepData as {
    id: string;
    step_number: number;
    title: string;
    tool_name: string;
    status: string;
    payload: { input?: Record<string, unknown> } | null;
    approval_id: string | null;
  } | null;

  if (!next) {
    // No remaining steps — compute final status.
    const { data: failed } = await supabaseAdmin
      .from("mission_steps")
      .select("id")
      .eq("mission_id", m.id)
      .eq("status", "failed")
      .limit(1)
      .maybeSingle();
    const finalStatus = failed ? "failed" : "success";
    await supabaseAdmin
      .from("missions")
      .update({
        status: finalStatus,
        finished_at: new Date().toISOString(),
        final_summary:
          finalStatus === "success"
            ? "All steps completed."
            : "Mission ended with one or more failed steps.",
      })
      .eq("id", m.id);
    await audit(m.id, m.user_id, "mission.finished", { final_status: finalStatus });
    return { ok: true, status: finalStatus };
  }

  // If step is waiting on approval, check whether approval was resolved.
  if (next.status === "waiting_for_approval" && next.approval_id) {
    const { data: ap } = await supabaseAdmin
      .from("approvals")
      .select("status")
      .eq("id", next.approval_id)
      .maybeSingle();
    const apStatus = (ap as { status?: string } | null)?.status;
    if (apStatus === "pending") {
      await supabaseAdmin
        .from("missions")
        .update({ status: "waiting_for_approval" })
        .eq("id", m.id);
      return { ok: true, status: "waiting_for_approval", note: "Awaiting human approval." };
    }
    if (apStatus === "denied" || apStatus === "expired") {
      await supabaseAdmin
        .from("mission_steps")
        .update({
          status: "skipped",
          output_summary: `Approval ${apStatus}.`,
          finished_at: new Date().toISOString(),
        })
        .eq("id", next.id);
      return tickMission(missionId);
    }
    if (apStatus === "approved") {
      // approvals.resolveApproval already ran executeApproved and recorded a tool_execution.
      // Look it up and mark the step success.
      const { data: te } = await supabaseAdmin
        .from("tool_executions")
        .select("id, status, error, result")
        .eq("approval_id", next.approval_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const exec = te as {
        id: string;
        status: string;
        error: string | null;
        result: unknown;
      } | null;
      if (!exec || exec.status === "pending" || exec.status === "running") {
        return {
          ok: true,
          status: "waiting_for_approval",
          note: "Approved — tool execution pending.",
        };
      }
      await supabaseAdmin
        .from("mission_steps")
        .update({
          status: exec.status === "success" ? "success" : "failed",
          tool_execution_id: exec.id,
          output_summary:
            exec.status === "success"
              ? "Approved & executed."
              : (exec.error ?? "Execution failed."),
          error: exec.status === "success" ? null : (exec.error ?? null),
          finished_at: new Date().toISOString(),
        })
        .eq("id", next.id);
      return tickMission(missionId);
    }
  }

  // Pending step — execute via the standard executor.
  await supabaseAdmin.from("missions").update({ status: "running" }).eq("id", m.id);
  await supabaseAdmin.from("mission_steps").update({ status: "running" }).eq("id", next.id);

  const toolName = next.tool_name as ToolName;
  if (!TOOL_REGISTRY[toolName]) {
    await supabaseAdmin
      .from("mission_steps")
      .update({
        status: "failed",
        error: `Unknown tool: ${next.tool_name}`,
        finished_at: new Date().toISOString(),
      })
      .eq("id", next.id);
    return tickMission(missionId);
  }

  const input = next.payload?.input ?? {};
  const adapterMode = await resolveAdapterMode(m.workspace_id);

  // Use the service-role client so executor inserts (tool_executions/audit) honor
  // the user_id binding via ctx.userId.
  const result = await executeTool(toolName, input, {
    supabase: supabaseAdmin,
    userId: m.user_id,
    conversationId: null,
    workspaceId: m.workspace_id,
    adapterMode,
  });

  if (result.pending && result.approvalId) {
    await supabaseAdmin
      .from("mission_steps")
      .update({
        status: "waiting_for_approval",
        approval_id: result.approvalId,
        input_summary: result.summary,
        output_summary: result.note ?? "Awaiting approval.",
      })
      .eq("id", next.id);
    await supabaseAdmin.from("missions").update({ status: "waiting_for_approval" }).eq("id", m.id);
    return { ok: true, status: "waiting_for_approval", note: result.note };
  }

  await supabaseAdmin
    .from("mission_steps")
    .update({
      status: result.ok ? "success" : "failed",
      input_summary: result.summary,
      output_summary: result.note ?? (result.ok ? "Step succeeded." : "Step failed."),
      error: result.ok ? null : (result.note ?? "Tool reported failure."),
      finished_at: new Date().toISOString(),
    })
    .eq("id", next.id);

  if (!result.ok) {
    // Stop on first failure for safety; user can re-run or cancel.
    await supabaseAdmin
      .from("missions")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error: result.note ?? null,
      })
      .eq("id", m.id);
    return { ok: false, status: "failed", note: result.note };
  }

  // Recurse to continue (bounded — there are at most 8 steps).
  return tickMission(missionId);
}
