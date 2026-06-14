# Browser-agent

A self-hostable headless-browser daemon used by Omena Codex for web
navigation, extraction, and form-fill tasks. **Disabled by default.**

## Why opt-in

- Headless browsers are heavy (Chromium ~500 MB) and not needed for many
  workflows.
- Browser tools touch the open web, which broadens the attack surface
  (SSRF, accidental credential entry, untrusted page JS).
- All browser tool calls are classified `restricted` or `dangerous` and
  require human approval — so they only make sense once an admin has
  decided to enable them.

## Activation

1. Generate a token: `openssl rand -hex 32`.
2. Edit `browser-agent/Dockerfile` and add Playwright install:
   ```dockerfile
   RUN npx playwright install --with-deps chromium
   ```
3. Uncomment the `browser-agent` service in `docker-compose.yml`.
4. Set in `.env`:
   ```
   BROWSER_AGENT_URL=http://browser-agent:8788
   BROWSER_AGENT_TOKEN=<token from step 1>
   BROWSER_AGENT_ALLOWED_ORIGINS=https://example.com,https://docs.example.com
   ```
5. `docker compose up -d browser-agent app`.
6. Open the **Health** screen — browser-agent row should turn green.

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET  /health` | liveness |
| `POST /sessions/navigate` | open a URL |
| `POST /sessions/extract` | extract text or HTML by selector |
| `POST /sessions/click` | click an element |
| `POST /sessions/fill` | fill a form field |
| `POST /sessions/screenshot` | full-page screenshot |

All require `Authorization: Bearer ${DAEMON_TOKEN}`.

## Safety

- **SSRF guard** — refuses `localhost`, `127.0.0.0/8`, `10.0.0.0/8`,
  `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, and the disallowed
  schemes `javascript:`, `file:`, `data:`, `chrome:`, `about:`,
  `view-source:`.
- **Origin allow-list** — when `ALLOWED_ORIGINS` is set, the daemon
  refuses to navigate to any origin not listed.
- **Selector heuristics** — `safety.ts` refuses selectors matching
  password, OTP, credit-card, or SSO buttons. Approval still required
  even when a selector passes the heuristic.
- **Action timeout** — capped by `ACTION_TIMEOUT_MS`.
- **Bytes cap** — `MAX_EXTRACT_BYTES` (default 1 MiB).

## What it WILL NOT do

- Bypass CAPTCHAs.
- Run stealth / anti-detection profiles.
- Persist third-party credentials.
- Solve identity / KYC / banking flows.
- Click "Sign in with Google/Apple/Microsoft" buttons on third-party
  sites (selector heuristic refuses these).
