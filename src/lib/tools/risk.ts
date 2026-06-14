// Tool risk classification — client-safe (no server imports).
// Used by both the server executor and any UI that wants to label a tool call.

export type RiskLevel = "safe" | "restricted" | "dangerous";
export type ToolName =
  | "plan"
  | "web_search"
  | "read_file"
  | "write_file"
  | "delete_file"
  | "list_files"
  | "search_files"
  | "get_workspace_info"
  | "get_logs"
  | "run_command"
  // M9 browser-agent tools — disabled until BROWSER_AGENT_URL/TOKEN configured.
  | "browser_navigate"
  | "browser_extract"
  | "browser_click"
  | "browser_fill"
  | "browser_screenshot";

const DANGEROUS_PATH_PATTERNS = [
  /(^|\/)\.ssh(\/|$)/i,
  /(^|\/)\.aws(\/|$)/i,
  /(^|\/)\.git(\/|$)/i,
  /(^|\/)\.env(\.|$)/i,
  /id_rsa|id_ed25519|credentials/i,
];

const DANGEROUS_COMMAND_PATTERNS = [
  /\brm\s+-rf?\b/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;:/, // fork bomb
  /\bshutdown\b|\breboot\b|\bhalt\b/i,
  /\bchown\s+-R\s+\//i,
  /\bchmod\s+-R\s+0?777\s+\//i,
  /\bcurl\b.+\|\s*(sh|bash|zsh)\b/i,
  /\bwget\b.+\|\s*(sh|bash|zsh)\b/i,
  /\b(printenv|env)\b/i,
  /\bcat\s+.*\.(env|pem|key)\b/i,
  /\bsudo\b/i,
];

const RESTRICTED_COMMAND_PATTERNS = [
  /\b(npm|bun|pnpm|yarn)\s+(install|i|add|remove|run|test)\b/i,
  /\b(git)\s+(commit|push|reset|checkout|rebase|merge)\b/i,
  /\b(make|cargo|go)\s+/i,
  /\b(docker|kubectl|terraform)\b/i,
  /\bmv\b|\bcp\b|\btouch\b|\bmkdir\b/i,
];

// Browser URL schemes that are never allowed.
const DANGEROUS_URL_PATTERNS = [/^javascript:/i, /^file:/i, /^data:/i, /^chrome:/i, /^about:/i];

// Selectors that hint at credential fields → escalate to dangerous.
const DANGEROUS_SELECTOR_PATTERNS = [
  /password/i,
  /\[type\s*=\s*['"]?password/i,
  /credit[-_ ]?card/i,
  /cvv|cvc/i,
  /ssn|social[-_ ]?security/i,
];

export interface RiskInput {
  tool: ToolName;
  input: Record<string, unknown>;
}

export function classifyRisk({ tool, input }: RiskInput): {
  risk: RiskLevel;
  reason: string;
} {
  if (tool === "plan") return { risk: "safe", reason: "Planning is read-only." };
  if (tool === "web_search")
    return { risk: "safe", reason: "External web lookup, no workspace mutation." };

  if (
    tool === "list_files" ||
    tool === "search_files" ||
    tool === "get_workspace_info" ||
    tool === "get_logs"
  )
    return { risk: "safe", reason: "Read-only remote-agent operation." };

  if (tool === "read_file") {
    const path = String(input.path ?? "");
    if (DANGEROUS_PATH_PATTERNS.some((r) => r.test(path)))
      return { risk: "dangerous", reason: `Reads a sensitive path (${path}).` };
    return { risk: "safe", reason: "Read-only access to workspace file." };
  }

  if (tool === "delete_file") {
    const path = String(input.path ?? "");
    if (DANGEROUS_PATH_PATTERNS.some((r) => r.test(path)))
      return { risk: "dangerous", reason: `Deletes a sensitive path (${path}).` };
    return { risk: "restricted", reason: "Deletes a workspace file." };
  }

  if (tool === "write_file") {
    const path = String(input.path ?? "");
    if (DANGEROUS_PATH_PATTERNS.some((r) => r.test(path)))
      return { risk: "dangerous", reason: `Writes to a sensitive path (${path}).` };
    return { risk: "restricted", reason: "Mutates a workspace file." };
  }

  if (tool === "run_command") {
    const cmd = String(input.command ?? "");
    if (DANGEROUS_COMMAND_PATTERNS.some((r) => r.test(cmd)))
      return { risk: "dangerous", reason: "Command matches a destructive pattern." };
    if (RESTRICTED_COMMAND_PATTERNS.some((r) => r.test(cmd)))
      return { risk: "restricted", reason: "Build/test/package management command." };
    return { risk: "restricted", reason: "Shell command — requires approval by default." };
  }

  if (tool === "browser_navigate") {
    const url = String(input.url ?? "");
    if (DANGEROUS_URL_PATTERNS.some((r) => r.test(url)))
      return { risk: "dangerous", reason: `Disallowed URL scheme (${url.slice(0, 40)}).` };
    return { risk: "restricted", reason: "Opens a remote URL in a headless browser." };
  }

  if (tool === "browser_extract" || tool === "browser_screenshot") {
    return { risk: "restricted", reason: "Reads content from a live browser session." };
  }

  if (tool === "browser_click") {
    const sel = String(input.selector ?? "");
    if (DANGEROUS_SELECTOR_PATTERNS.some((r) => r.test(sel)))
      return { risk: "dangerous", reason: `Clicks a sensitive control (${sel.slice(0, 60)}).` };
    return { risk: "restricted", reason: "Clicks an element on the page." };
  }

  if (tool === "browser_fill") {
    const sel = String(input.selector ?? "");
    if (DANGEROUS_SELECTOR_PATTERNS.some((r) => r.test(sel)))
      return { risk: "dangerous", reason: `Fills a sensitive input (${sel.slice(0, 60)}).` };
    return { risk: "restricted", reason: "Types into an input on the page." };
  }

  return { risk: "restricted", reason: "Unknown tool, default to restricted." };
}

export function summarizeInput(tool: ToolName, input: Record<string, unknown>): string {
  switch (tool) {
    case "plan":
      return `${(input.steps as string[] | undefined)?.length ?? 0} steps`;
    case "web_search":
      return String(input.query ?? "").slice(0, 120);
    case "read_file":
    case "delete_file":
    case "list_files":
      return String(input.path ?? ".");
    case "search_files":
      return `${input.query ?? ""} in ${input.path ?? "."}`;
    case "get_workspace_info":
      return "workspace info";
    case "get_logs":
      return String(input.commandId ?? "recent logs");
    case "write_file": {
      const len = String(input.content ?? "").length;
      return `${input.path ?? ""} · ${len} bytes`;
    }
    case "run_command":
      return String(input.command ?? "").slice(0, 200);
    case "browser_navigate":
      return String(input.url ?? "").slice(0, 200);
    case "browser_extract":
      return `extract ${String(input.selector ?? "body").slice(0, 80)}`;
    case "browser_click":
      return `click ${String(input.selector ?? "").slice(0, 80)}`;
    case "browser_fill":
      return `fill ${String(input.selector ?? "").slice(0, 60)}`;
    case "browser_screenshot":
      return String(input.url ?? "current page").slice(0, 200);
    default:
      return JSON.stringify(input).slice(0, 200);
  }
}
