import http from "node:http";
import crypto from "node:crypto";
import { requireDaemonToken } from "./auth.js";
import { assertSafeUrl } from "./safety.js";

// ============================================================================
// SCAFFOLD NOTICE
// ----------------------------------------------------------------------------
// This service is intentionally shipped DISABLED. No Playwright import exists
// at module scope. To activate:
//   1. Run `npm install playwright` inside `browser-agent/`.
//   2. Run `npx playwright install --with-deps chromium`.
//   3. Implement the body of `withBrowser()` to launch Playwright.
//   4. Set `ENABLE_BROWSER_AGENT=1` in this service's environment.
//   5. Set `BROWSER_AGENT_URL` and `BROWSER_AGENT_TOKEN` on the Omena Codex
//      app side so the executor will route browser tools here.
//
// Until step 4 is performed, every action endpoint returns HTTP 503 with a
// clear message so missions can plan safely without touching a real browser.
// ============================================================================

const startedAt = Date.now();
const port = Number(process.env.PORT ?? 8788);
const token = process.env.DAEMON_TOKEN ?? "";
const enabled = process.env.ENABLE_BROWSER_AGENT === "1";
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const actionTimeoutMs = Number(process.env.ACTION_TIMEOUT_MS ?? 20_000);

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

/**
 * Placeholder for the Playwright integration. Implementations should:
 *   - Launch (or reuse) a Chromium context with a short-lived session id.
 *   - Apply ALLOWED_ORIGINS, blocked URL schemes, and per-action timeouts.
 *   - Refuse to interact with `<input type=password>` / credential fields.
 *   - Return a structured result; never serialize cookies or storage.
 */
async function withBrowser<T>(_fn: () => Promise<T>): Promise<T> {
  throw Object.assign(
    new Error(
      "browser-agent scaffold: Playwright integration not implemented. See browser-agent/README.md.",
    ),
    { statusCode: 503 },
  );
}

interface NavigateInput {
  url?: string;
  waitFor?: "load" | "domcontentloaded" | "networkidle";
}
interface ExtractInput {
  selector?: string;
  format?: "text" | "html";
}
interface ClickInput {
  selector?: string;
}
interface FillInput {
  selector?: string;
  value?: string;
}
interface ScreenshotInput {
  url?: string;
  fullPage?: boolean;
}

async function handleNavigate(input: NavigateInput) {
  const url = String(input.url ?? "");
  assertSafeUrl(url, allowedOrigins);
  return withBrowser(async () => ({
    sessionId: crypto.randomUUID(),
    status: 200,
    finalUrl: url,
  }));
}

async function handleExtract(input: ExtractInput) {
  const selector = input.selector ? String(input.selector) : "body";
  const format = input.format === "html" ? "html" : "text";
  return withBrowser(async () => ({ content: "", length: 0, selector, format }));
}

async function handleClick(input: ClickInput) {
  const selector = String(input.selector ?? "");
  if (!selector) throw Object.assign(new Error("Missing selector"), { statusCode: 400 });
  return withBrowser(async () => ({ clicked: true, selector }));
}

async function handleFill(input: FillInput) {
  const selector = String(input.selector ?? "");
  if (!selector) throw Object.assign(new Error("Missing selector"), { statusCode: 400 });
  if (/password|cvv|cvc|credit[-_ ]?card|ssn/i.test(selector)) {
    throw Object.assign(new Error("Refusing to fill credential field."), { statusCode: 400 });
  }
  return withBrowser(async () => ({ filled: true, selector }));
}

async function handleScreenshot(input: ScreenshotInput) {
  if (input.url) assertSafeUrl(String(input.url), allowedOrigins);
  return withBrowser(async () => ({ bytes: 0, mime: "image/png", base64: "" }));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  try {
    requireDaemonToken(req, token);
    if (req.method === "GET" && url.pathname === "/health") {
      return send(res, 200, {
        ok: true,
        enabled,
        version: "0.1.0-scaffold",
        uptimeMs: Date.now() - startedAt,
        actionTimeoutMs,
      });
    }
    if (!enabled) {
      throw Object.assign(
        new Error(
          "browser-agent is disabled. Set ENABLE_BROWSER_AGENT=1 after implementing Playwright integration.",
        ),
        { statusCode: 503 },
      );
    }
    if (req.method === "POST" && url.pathname === "/sessions/navigate")
      return send(res, 200, await handleNavigate(await body<NavigateInput>(req)));
    if (req.method === "POST" && url.pathname === "/sessions/extract")
      return send(res, 200, await handleExtract(await body<ExtractInput>(req)));
    if (req.method === "POST" && url.pathname === "/sessions/click")
      return send(res, 200, await handleClick(await body<ClickInput>(req)));
    if (req.method === "POST" && url.pathname === "/sessions/fill")
      return send(res, 200, await handleFill(await body<FillInput>(req)));
    if (req.method === "POST" && url.pathname === "/sessions/screenshot")
      return send(res, 200, await handleScreenshot(await body<ScreenshotInput>(req)));
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
  console.log(
    `omena-browser-agent listening on :${port} enabled=${enabled} allowedOrigins=${allowedOrigins.length || "any"}`,
  ),
);
