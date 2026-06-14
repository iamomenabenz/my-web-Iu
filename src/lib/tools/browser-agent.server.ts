// Browser-agent adapter — server-only. Mirrors remote-agent.server.ts.
// Disabled by default. Activated only when BOTH BROWSER_AGENT_URL and
// BROWSER_AGENT_TOKEN env vars are set at runtime. Never imported from
// client code (file is *.server.ts so the bundler enforces this).
//
// Contract of the browser-agent daemon (the user runs this themselves on
// their own host — see /browser-agent/README.md):
//   GET  {url}/health                             -> { ok, version, uptimeMs }
//   POST {url}/sessions/navigate { url, waitFor } -> { sessionId, status, finalUrl }
//   POST {url}/sessions/extract  { selector?, format } -> { content, length }
//   POST {url}/sessions/click    { selector }     -> { clicked: true }
//   POST {url}/sessions/fill     { selector, value } -> { filled: true }
//   POST {url}/sessions/screenshot { url?, fullPage? } -> { bytes, mime, base64 }
// All requests carry: Authorization: Bearer <token>.

export interface BrowserAgentConfig {
  url: string;
  token: string;
  timeoutMs?: number;
}

export interface BrowserAgentResult<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

/**
 * Returns true when both BROWSER_AGENT_URL and BROWSER_AGENT_TOKEN are set
 * and non-empty. Read at call time — env injection happens per-request.
 */
export function isBrowserAgentEnabled(): boolean {
  const url = process.env.BROWSER_AGENT_URL;
  const token = process.env.BROWSER_AGENT_TOKEN;
  return Boolean(url && token && url.startsWith("http"));
}

export function resolveBrowserAgentConfig(): BrowserAgentConfig | null {
  if (!isBrowserAgentEnabled()) return null;
  return {
    url: process.env.BROWSER_AGENT_URL as string,
    token: process.env.BROWSER_AGENT_TOKEN as string,
    timeoutMs: Number(process.env.BROWSER_AGENT_TIMEOUT_MS ?? 30_000),
  };
}

async function browserFetch<T>(
  cfg: BrowserAgentConfig,
  path: string,
  init: RequestInit,
): Promise<BrowserAgentResult<T>> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), cfg.timeoutMs ?? 30_000);
  try {
    const res = await fetch(`${cfg.url.replace(/\/$/, "")}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${cfg.token}`,
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    let data: unknown = undefined;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error:
          (data && typeof data === "object" && "error" in data
            ? String((data as { error: unknown }).error)
            : text) || `Browser-agent HTTP ${res.status}`,
      };
    }
    return { ok: true, status: res.status, data: data as T };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: e instanceof Error ? e.message : "Network error reaching browser-agent",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function browserHealth(cfg: BrowserAgentConfig) {
  return browserFetch<{ ok: boolean; version?: string; uptimeMs?: number }>(cfg, "/health", {
    method: "GET",
  });
}

export function browserNavigate(
  cfg: BrowserAgentConfig,
  input: { url: string; waitFor?: "load" | "domcontentloaded" | "networkidle" },
) {
  return browserFetch<{ sessionId: string; status: number; finalUrl: string }>(
    cfg,
    "/sessions/navigate",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function browserExtract(
  cfg: BrowserAgentConfig,
  input: { selector?: string; format?: "text" | "html" },
) {
  return browserFetch<{ content: string; length: number }>(cfg, "/sessions/extract", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function browserClick(cfg: BrowserAgentConfig, input: { selector: string }) {
  return browserFetch<{ clicked: boolean }>(cfg, "/sessions/click", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function browserFill(cfg: BrowserAgentConfig, input: { selector: string; value: string }) {
  return browserFetch<{ filled: boolean }>(cfg, "/sessions/fill", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function browserScreenshot(
  cfg: BrowserAgentConfig,
  input: { url?: string; fullPage?: boolean },
) {
  return browserFetch<{ bytes: number; mime: string; base64: string }>(
    cfg,
    "/sessions/screenshot",
    { method: "POST", body: JSON.stringify(input) },
  );
}
