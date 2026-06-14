// M8 tool registry — single source of truth for tools available to AI missions.
// Client-safe (no server imports). Tools listed here are mediated by
// executor.server.ts and gated by approvals; this registry never executes.

import { z } from "zod";
import type { ToolName } from "./risk";

export type ToolCategory = "planning" | "filesystem" | "shell" | "info" | "web";

export interface ToolDescriptor {
  name: ToolName;
  category: ToolCategory;
  description: string;
  inputSchema: z.ZodTypeAny;
  /** Default risk if no input-specific override applies. */
  defaultRisk: "safe" | "restricted" | "dangerous";
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
};

/** Tools allowed at each permission level (cumulative). */
export const PERMISSION_TIERS = {
  safe: ["plan", "web_search", "read_file", "list_files", "search_files", "get_workspace_info", "get_logs"],
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

export type PermissionLevel = keyof typeof PERMISSION_TIERS;

export function toolsForPermission(level: PermissionLevel): ToolName[] {
  return [...PERMISSION_TIERS[level]];
}
