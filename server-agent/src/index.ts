import http from "node:http";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import readline from "node:readline";
import crypto from "node:crypto";
import { requireDaemonToken } from "./auth.js";
import { assertSafeCommand, assertSafeRelativePath, normalizeWorkspaceRoot } from "./safety.js";
import { listFiles, workspaceInfo } from "./workspace.js";

const startedAt = Date.now();
const port = Number(process.env.PORT ?? 8787);
const token = process.env.DAEMON_TOKEN ?? "";
const workspaceRoot = normalizeWorkspaceRoot(process.env.WORKSPACE_ROOT ?? process.cwd());
const defaultTimeoutMs = Number(process.env.COMMAND_TIMEOUT_MS ?? 60_000);
const maxFileBytes = Number(process.env.MAX_FILE_BYTES ?? 1_048_576);
const maxSearchResults = Number(process.env.MAX_SEARCH_RESULTS ?? 100);
const commands = new Map<string, { child: ChildProcess; logs: string[]; startedAt: number }>();
const recentLogs: Array<Record<string, unknown>> = [];

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function body<T>(req: http.IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? (JSON.parse(raw) as T) : ({} as T);
}

function log(entry: Record<string, unknown>) {
  recentLogs.push({ at: new Date().toISOString(), ...entry });
  recentLogs.splice(0, Math.max(0, recentLogs.length - 500));
}

async function runCommand(input: { command?: string; cwd?: string; timeoutMs?: number }) {
  const command = String(input.command ?? "");
  assertSafeCommand(command);
  const cwd = input.cwd ? assertSafeRelativePath(input.cwd, workspaceRoot) : workspaceRoot;
  const commandId = crypto.randomUUID();
  const started = Date.now();
  const child = spawn(command, { cwd, shell: true, env: { PATH: process.env.PATH ?? "" } });
  const logs: string[] = [];
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  commands.set(commandId, { child, logs, startedAt: started });
  const push = (stream: "stdout" | "stderr", data: Buffer) => {
    const text = data.toString("utf8");
    logs.push(text);
    if (stream === "stdout") stdoutChunks.push(text);
    else stderrChunks.push(text);
    log({ commandId, stream, text: text.slice(0, 4000) });
  };
  child.stdout?.on("data", (d: Buffer) => push("stdout", d));
  child.stderr?.on("data", (d: Buffer) => push("stderr", d));
  const timeout = setTimeout(
    () => child.kill("SIGTERM"),
    Math.min(input.timeoutMs ?? defaultTimeoutMs, defaultTimeoutMs),
  );
  const exitCode = await new Promise<number | null>((resolve) => child.on("close", resolve));
  clearTimeout(timeout);
  commands.delete(commandId);
  return {
    commandId,
    exitCode: exitCode ?? -1,
    stdout: stdoutChunks.join("").slice(0, 100_000),
    stderr: stderrChunks.join("").slice(0, 100_000),
    durationMs: Date.now() - started,
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    requireDaemonToken(req, token);
    if (req.method === "GET" && url.pathname === "/health")
      return send(res, 200, { ok: true, version: "0.1.0", uptimeMs: Date.now() - startedAt });
    if (req.method === "GET" && url.pathname === "/workspace/info")
      return send(res, 200, await workspaceInfo(workspaceRoot));
    if (req.method === "GET" && url.pathname === "/files/list")
      return send(
        res,
        200,
        await listFiles(
          workspaceRoot,
          url.searchParams.get("path") ?? ".",
          Number(url.searchParams.get("limit") ?? 200),
        ),
      );
    if (req.method === "POST" && url.pathname === "/files/read") {
      const input = await body<{ path?: string }>(req);
      const full = assertSafeRelativePath(input.path, workspaceRoot);
      const stat = await fs.stat(full);
      if (stat.size > maxFileBytes)
        throw Object.assign(new Error("File exceeds max read size."), { statusCode: 413 });
      return send(res, 200, {
        path: path.relative(workspaceRoot, full),
        content: await fs.readFile(full, "utf8"),
      });
    }
    if (req.method === "POST" && url.pathname === "/files/write") {
      const input = await body<{ path?: string; content?: string }>(req);
      const full = assertSafeRelativePath(input.path, workspaceRoot);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, String(input.content ?? ""), "utf8");
      return send(res, 200, {
        path: path.relative(workspaceRoot, full),
        bytes: Buffer.byteLength(String(input.content ?? "")),
      });
    }
    if (req.method === "POST" && url.pathname === "/files/delete") {
      const input = await body<{ path?: string }>(req);
      const full = assertSafeRelativePath(input.path, workspaceRoot);
      await fs.rm(full, { recursive: false, force: true });
      return send(res, 200, { path: path.relative(workspaceRoot, full), deleted: true });
    }
    if (req.method === "POST" && url.pathname === "/files/search") {
      const input = await body<{ query?: string; path?: string; limit?: number }>(req);
      const query = String(input.query ?? "");
      const dir = assertSafeRelativePath(input.path ?? ".", workspaceRoot);
      const matches: unknown[] = [];
      async function walk(current: string): Promise<void> {
        if (matches.length >= Math.min(input.limit ?? maxSearchResults, maxSearchResults)) return;
        for (const entry of await fs.readdir(current, { withFileTypes: true })) {
          const full = path.join(current, entry.name);
          assertSafeRelativePath(path.relative(workspaceRoot, full), workspaceRoot);
          if (entry.isDirectory()) await walk(full);
          else if (entry.isFile()) {
            let lineNo = 0;
            for await (const line of readline.createInterface({
              input: createReadStream(full),
              crlfDelay: Infinity,
            })) {
              lineNo += 1;
              if (line.includes(query))
                matches.push({
                  path: path.relative(workspaceRoot, full),
                  line: lineNo,
                  preview: line.slice(0, 300),
                });
              if (matches.length >= Math.min(input.limit ?? maxSearchResults, maxSearchResults))
                return;
            }
          }
        }
      }
      await walk(dir);
      return send(res, 200, { matches });
    }
    if (req.method === "POST" && url.pathname === "/commands/run")
      return send(
        res,
        200,
        await runCommand(await body<{ command?: string; cwd?: string; timeoutMs?: number }>(req)),
      );
    if (req.method === "POST" && url.pathname === "/commands/stop") {
      const input = await body<{ commandId?: string }>(req);
      const item = commands.get(String(input.commandId ?? ""));
      if (!item) return send(res, 404, { ok: false, error: "Command not running." });
      item.child.kill("SIGTERM");
      return send(res, 200, { commandId: input.commandId, stopped: true });
    }
    if (req.method === "GET" && url.pathname === "/commands/logs")
      return send(res, 200, {
        logs: recentLogs.slice(-Number(url.searchParams.get("limit") ?? 100)),
      });
    return send(res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    const err = error as Error & { statusCode?: number };
    send(res, err.statusCode ?? 500, {
      ok: false,
      error: err.message,
      code: err.statusCode ?? 500,
    });
  }
});

server.listen(port, () =>
  console.log(`omena-server-agent listening on :${port} root=${workspaceRoot}`),
);
