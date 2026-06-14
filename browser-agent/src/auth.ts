import http from "node:http";

export function requireDaemonToken(req: http.IncomingMessage, expected: string): void {
  if (!expected) {
    throw Object.assign(new Error("Daemon token not configured."), { statusCode: 500 });
  }
  const header = req.headers["authorization"];
  if (!header || !header.startsWith("Bearer ")) {
    throw Object.assign(new Error("Missing bearer token."), { statusCode: 401 });
  }
  const provided = header.slice("Bearer ".length).trim();
  // Constant-time compare to avoid timing oracles.
  if (provided.length !== expected.length) {
    throw Object.assign(new Error("Invalid token."), { statusCode: 401 });
  }
  let mismatch = 0;
  for (let i = 0; i < provided.length; i++)
    mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  if (mismatch !== 0) {
    throw Object.assign(new Error("Invalid token."), { statusCode: 401 });
  }
}
