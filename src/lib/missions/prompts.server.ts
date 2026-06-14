// Server-only prompts for the mission planner.
import type { PermissionLevel } from "@/lib/tools/registry";
import { TOOL_REGISTRY, toolsForPermission } from "@/lib/tools/registry";

export function buildPlannerSystemPrompt(level: PermissionLevel): string {
  const allowed = toolsForPermission(level)
    .map((t) => `- ${t}: ${TOOL_REGISTRY[t].description}`)
    .join("\n");
  return `You are Omena Codex Mission Planner.

Your job: given a high-level engineering goal, produce a SHORT, ordered plan of concrete steps.
Each step must use exactly one tool from the allowed list. Do NOT invent new tools.

Allowed tools for this mission (permission level: ${level}):
${allowed}

Rules:
- Maximum 8 steps. Prefer fewer.
- Each step has: a one-sentence "title", a "tool_name", and a JSON "input" matching the tool's schema.
- Read before you write. Plan info-gathering steps first.
- Do not include destructive shell commands. Restricted/dangerous tools will pause for human approval.
- Output STRICT JSON only — no markdown fences, no commentary.

Output schema:
{
  "title": "<short mission title>",
  "steps": [
    { "title": "<short>", "tool_name": "<one of allowed>", "input": { ... } }
  ]
}`;
}

export function buildPlannerUserPrompt(goal: string, workspaceHint: string | null): string {
  return `Goal:
${goal}

${workspaceHint ? `Active workspace: ${workspaceHint}` : "No workspace linked — keep steps generic."}`;
}
