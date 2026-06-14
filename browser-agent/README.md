# Omena Browser-Agent (M9 scaffold)

A headless-browser daemon that Omena Codex missions can drive through the
browser-* tools (`browser_navigate`, `browser_extract`, `browser_click`,
`browser_fill`, `browser_screenshot`).

> **This scaffold is shipped DISABLED.** No Playwright dependency is declared;
> no real browser is launched. Every action endpoint returns HTTP 503 until an
> admin installs Playwright, implements the launch path in `src/index.ts`, and
> sets `ENABLE_BROWSER_AGENT=1`.

## Why it is disabled

Per M9 safety policy:

- The Omena Codex app side only routes browser tools to this daemon when
  **both** `BROWSER_AGENT_URL` and `BROWSER_AGENT_TOKEN` are configured.
- Without those env vars, the executor refuses browser tools and the mission
  planner is told the browser-agent is disabled (so it never proposes one).
- Even when env vars are set, the daemon itself refuses to act until
  `ENABLE_BROWSER_AGENT=1` is set in *this* service's environment.
- M6 approvals are never bypassed — every browser action is a restricted or
  dangerous tool that pauses the mission until a human approves it.

## Architecture

```
Mission planner (server)
       │  selects a browser_* tool
       ▼
Mission runner → executeTool() ─── risk check ──▶ approval queued
                                                     │ (human approves)
                                                     ▼
                              executor.server.ts → browser-agent.server.ts (HTTP)
                                                     │  Authorization: Bearer
                                                     ▼
                                          THIS SERVICE → Playwright → page
```

The daemon is the only place a real browser ever runs. Tokens and pages stay
on the daemon host; only structured JSON results return to Omena Codex.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness + enabled flag |
| POST | `/sessions/navigate` | `{ url, waitFor? }` → `{ sessionId, status, finalUrl }` |
| POST | `/sessions/extract` | `{ selector?, format? }` → `{ content, length }` |
| POST | `/sessions/click` | `{ selector }` → `{ clicked: true }` |
| POST | `/sessions/fill` | `{ selector, value }` → `{ filled: true }` (refuses credential selectors) |
| POST | `/sessions/screenshot` | `{ url?, fullPage? }` → `{ bytes, mime, base64 }` |

All non-health endpoints require `Authorization: Bearer <DAEMON_TOKEN>`.

## Safety controls (built-in)

- Constant-time bearer-token compare (`src/auth.ts`).
- URL scheme allow-list: only `http:` / `https:` (`src/safety.ts`).
- Hard refusal of loopback / RFC1918 / link-local hostnames (SSRF mitigation).
- Optional origin allow-list via `ALLOWED_ORIGINS=https://a.com,https://b.com`.
- Selector blocklist for credential fields (`password`, `cvv`, `cvc`,
  `credit-card`, `ssn`).
- Per-action timeout via `ACTION_TIMEOUT_MS`.
- The daemon never persists cookies, storage state, or page HTML to disk.

## Enabling the agent (admin)

1. `cd browser-agent && npm install`
2. `npm install playwright` and `npx playwright install --with-deps chromium`
3. Open `src/index.ts` → implement `withBrowser()` to launch Chromium and
   route the existing handlers to Playwright APIs. Keep all safety checks.
4. Set environment for **this service**:
   ```
   PORT=8788
   DAEMON_TOKEN=<long random>
   ENABLE_BROWSER_AGENT=1
   ALLOWED_ORIGINS=https://example.com
   ```
5. Set environment for **Omena Codex** (the app side):
   ```
   BROWSER_AGENT_URL=https://browser-agent.your-host.internal
   BROWSER_AGENT_TOKEN=<same value as DAEMON_TOKEN>
   ```
6. Verify with `curl -H "Authorization: Bearer $DAEMON_TOKEN" $BROWSER_AGENT_URL/health`.

## Mock / dry-run behaviour

If `ENABLE_BROWSER_AGENT` is unset, every action endpoint replies:

```json
{ "ok": false, "code": 503, "error": "browser-agent is disabled. ..." }
```

The Omena Codex executor surfaces this verbatim on the mission step so the
operator knows to either skip the step or finish the integration.

## Limitations of the scaffold

- No Playwright dependency declared — running `npm run dev` will start an
  HTTP server that 503s every action until you wire `withBrowser()`.
- No session lifecycle, cookie isolation, or screenshot encoding implemented.
- No request queue or per-mission concurrency limits — add before running on
  shared infrastructure.
