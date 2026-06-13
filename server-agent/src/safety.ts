import path from "node:path";

const SECRET_PATTERNS = [
  /(^|[/\\])\.env($|[./\\])/i,
  /(^|[/\\])\.git($|[/\\])/i,
  /(^|[/\\])\.ssh($|[/\\])/i,
  /(^|[/\\])\.aws($|[/\\])/i,
  /(^|[/\\])(id_rsa|id_ed25519|id_dsa|id_ecdsa)($|[./\\])/i,
  /(^|[/\\])(credentials|credential|secrets?|tokens?)($|[./\\])/i,
  /\.(pem|key|p12|pfx)$/i,
];

const SYSTEM_ROOTS = [
  "/",
  "/etc",
  "/root",
  "/home",
  "/usr",
  "/var",
  "/opt",
  "/proc",
  "/sys",
  "/dev",
  "/run",
  "/tmp",
];

export function normalizeWorkspaceRoot(root: string): string {
  const resolved = path.resolve(root || ".");
  if (SYSTEM_ROOTS.includes(resolved)) {
    throw Object.assign(new Error(`Refusing unsafe workspace root: ${resolved}`), {
      statusCode: 400,
    });
  }
  return resolved;
}

export function assertSafeRelativePath(inputPath = ".", workspaceRoot: string): string {
  if (path.isAbsolute(inputPath)) {
    throw Object.assign(new Error("Absolute paths are not allowed."), { statusCode: 400 });
  }
  const normalized = path.normalize(inputPath).replace(/^([/\\])+/, "");
  const resolved = path.resolve(workspaceRoot, normalized);
  const rel = path.relative(workspaceRoot, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw Object.assign(new Error("Path escapes the workspace root."), { statusCode: 403 });
  }
  if (SECRET_PATTERNS.some((pattern) => pattern.test(rel))) {
    throw Object.assign(new Error("Blocked access to a secret or system path."), {
      statusCode: 403,
    });
  }
  return resolved;
}

export function assertSafeCommand(command: string): void {
  if (!command.trim()) throw Object.assign(new Error("Command is required."), { statusCode: 400 });
  if (/\b(printenv|env)\b|\.env|\.ssh|\.aws|id_rsa|id_ed25519|credentials|secret/i.test(command)) {
    throw Object.assign(new Error("Command appears to access secrets and was blocked."), {
      statusCode: 403,
    });
  }
}
