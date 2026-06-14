import type { IncomingMessage } from "node:http";

export function requireDaemonToken(req: IncomingMessage, token: string): void {
  if (!token || token.length < 8) {
    throw Object.assign(new Error("Daemon token is not configured securely."), { statusCode: 500 });
  }
  const header = req.headers.authorization ?? "";
  const expected = `Bearer ${token}`;
  if (header !== expected) {
    throw Object.assign(new Error("Unauthorized daemon request."), { statusCode: 401 });
  }
}
