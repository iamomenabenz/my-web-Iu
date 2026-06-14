// M8 tool registry — single source of truth for tools available to AI missions.
// Client-safe (no server imports). Tools listed here are mediated by
// executor.server.ts and gated by approvals; this registry never executes.

import { z } from "zod";
import type { ToolName } from "./risk";

export type ToolCategory = "planning" | "filesystem" | "shell" | "info" | "web" | "browser";

export interface ToolDescriptor {
  name: ToolName;
  category: ToolCategory;
  description: string;
  inputSchema: z.ZodTypeAny;
  /** Default risk if no input-specific override applies. */
  defaultRisk: "safe" | "restricted" | "dangerous";
  /**
   * If true, this tool requires an external agent (browser-agent) to be
   * configured server-side before it can be planned or executed.
   */
  requiresBrowserAgent?: boolean;
}

export const TOOL_REGISTRY: Record<ToolName, ToolDescriptor> = {
  plan: {
    name: "plan",
    category: "planning",
    description: "Share an ordered plan of steps before acting.",
    inputSchema: z.object({ steps: z.array(z.string().min(1).max(400)).min(1).max(20) }),
    defaultRisk: "safe",
  },
  web_search: {
    name: "web_search",
    category: "web",
    description: "Search the public web for information.",
    inputSchema: z.object({ query: z.string().min(1).max(200) }),
    defaultRisk: "safe",
  },
  read_file: {
    name: "read_file",
    category: "filesystem",
    description: "Read a file from the active workspace.",
    inputSchema: z.object({ path: z.string().min(1).max(1024) }),
    defaultRisk: "safe",
  },
  list_files: {
    name: "list_files",
    category: "filesystem",
    description: "List files under a workspace directory.",
    inputSchema: z.object({
      path: z.string().max(1024).optional(),
      limit: z.number().int().min(1).max(500).optional(),
    }),
    defaultRisk: "safe",
  },
  search_files: {
    name: "search_files",
    category: "filesystem",
    description: "Search files in the workspace for a string.",
    inputSchema: z.object({
      query: z.string().min(1).max(200),
      path: z.string().max(1024).optional(),
      limit: z.number().int().min(1).max(500).optional(),
    }),
    defaultRisk: "safe",
  },
  get_workspace_info: {
    name: "get_workspace_info",
    category: "info",
    description: "Get metadata about the active workspace.",
    inputSchema: z.object({}),
    defaultRisk: "safe",
  },
  get_logs: {
    name: "get_logs",
    category: "info",
    description: "Fetch recent command logs from the linked server-agent.",
    inputSchema: z.object({
      commandId: z.string().optional(),
      limit: z.number().int().min(1).max(500).optional(),
    }),
    defaultRisk: "safe",
  },
  write_file: {
    name: "write_file",
    category: "filesystem",
    description: "Create or overwrite a workspace file. Requires approval.",
    inputSchema: z.object({
      path: z.string().min(1).max(1024),
      content: z.string().max(200_000),
      reason: z.string().max(500),
    }),
    defaultRisk: "restricted",
  },
  delete_file: {
    name: "delete_file",
    category: "filesystem",
    description: "Delete a workspace file. Requires approval.",
    inputSchema: z.object({
      path: z.string().min(1).max(1024),
      reason: z.string().max(500),
    }),
    defaultRisk: "restricted",
  },
  run_command: {
    name: "run_command",
    category: "shell",
    description: "Run a shell command in the workspace. Requires approval.",
    inputSchema: z.object({
      command: z.string().min(1).max(2000),
      cwd: z.string().optional(),
      reason: z.string().max(500),
      timeoutMs: z.number().int().min(1000).max(300_000).optional(),
    }),
    defaultRisk: "restricted",
  },
  // ---- M9 browser-agent tools (disabled until configured) ----
  browser_navigate: {
    name: "browser_navigate",
    category: "browser",
    description:
      "Open a URL in a headless browser session. Requires approval and an enabled browser-agent.",
    inputSchema: z.object({
      url: z.string().url().max(2048),
      reason: z.string().max(500),
      waitFor: z.enum(["load", "domcontentloaded", "networkidle"]).optional(),
    }),
    defaultRisk: "restricted",
    requiresBrowserAgent: true,
  },
  browser_extract: {
    name: "browser_extract",
    category: "browser",
    description:
      "Extract text or HTML from the active browser page. Requires approval and an enabled browser-agent.",
    inputSchema: z.object({
      selector: z.string().min(1).max(500).optional(),
      format: z.enum(["text", "html"]).optional(),
      reason: z.string().max(500),
    }),
    defaultRisk: "restricted",
    requiresBrowserAgent: true,
  },
  browser_click: {
    name: "browser_click",
    category: "browser",
    description:
      "Click an element on the active browser page. Requires approval and an enabled browser-agent.",
    inputSchema: z.object({
      selector: z.string().min(1).max(500),
      reason: z.string().max(500),
    }),
    defaultRisk: "restricted",
    requiresBrowserAgent: true,
  },
  browser_fill: {
    name: "browser_fill",
    category: "browser",
    description:
      "Type a value into an input. Refuses password/credential selectors. Requires approval.",
    inputSchema: z.object({
      selector: z.string().min(1).max(500),
      value: z.string().max(2000),
      reason: z.string().max(500),
    }),
    defaultRisk: "restricted",
    requiresBrowserAgent: true,
  },
  browser_screenshot: {
    name: "browser_screenshot",
    category: "browser",
    description:
      "Capture a screenshot of the current page. Requires approval and an enabled browser-agent.",
    inputSchema: z.object({
      url: z.string().url().max(2048).optional(),
      fullPage: z.boolean().optional(),
      reason: z.string().max(500),
    }),
    defaultRisk: "restricted",
    requiresBrowserAgent: true,
  },
};

/**
 * Tools allowed at each permission level (cumulative). Browser tools live in
 * their own gate (see `toolsForPermission` second argument) and are NEVER
 * included unless an enabled browser-agent is configured server-side.
 */
export const PERMISSION_TIERS = {
  safe: [
    "plan",
    "web_search",
    "read_file",
    "list_files",
    "search_files",
    "get_workspace_info",
    "get_logs",
  ],
  restricted: [
    "plan",
    "web_search",
    "read_file",
    "list_files",
    "search_files",
    "get_workspace_info",
    "get_logs",
    "write_file",
    "delete_file",
    "run_command",
  ],
  dangerous: [
    "plan",
    "web_search",
    "read_file",
    "list_files",
    "search_files",
    "get_workspace_info",
    "get_logs",
    "write_file",
    "delete_file",
    "run_command",
  ],
} as const satisfies Record<"safe" | "restricted" | "dangerous", readonly ToolName[]>;

const BROWSER_TOOLS = [
  "browser_navigate",
  "browser_extract",
  "browser_click",
  "browser_fill",
  "browser_screenshot",
] as const satisfies readonly ToolName[];

export type PermissionLevel = keyof typeof PERMISSION_TIERS;

/**
 * Returns the tools the planner is allowed to choose from for a mission.
 *
 * `browserAgentEnabled` is determined server-side by `isBrowserAgentEnabled()`
 * (in `browser-agent.server.ts`). When false (the default — no
 * `BROWSER_AGENT_URL`/`BROWSER_AGENT_TOKEN` env vars set), browser tools are
 * never returned, the planner cannot propose them, and the executor will
 * refuse them even if the model hallucinates one.
 */
export function toolsForPermission(
  level: PermissionLevel,
  browserAgentEnabled = false,
): ToolName[] {
  const base = [...PERMISSION_TIERS[level]];
  if (browserAgentEnabled && level !== "safe") {
    return [...base, ...BROWSER_TOOLS];
  }
  return base;
}

export function isBrowserTool(tool: ToolName): boolean {
  return TOOL_REGISTRY[tool].requiresBrowserAgent === true;
}
