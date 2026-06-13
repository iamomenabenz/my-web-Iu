# Omena Codex

## Runtime requirements

- Node.js >= 22.12.0 (see `.node-version` / `.nvmrc`).
- Bun 1.2.x is the primary Lovable/TanStack package manager for this repo (`bun.lock` + `bunfig.toml`).
- `package-lock.json` is kept in sync for npm-based CI compatibility, but prefer `bun install` for local Lovable workflows.


A production-ready, mobile-first operator console for AI engineering agents.
Built with **TanStack Start**, **React 19**, **Vite 7**, **Tailwind v4**, and **Bun**.
Fully self-hostable — clone, configure, deploy.

> Screens: Tasks · Chat · Terminal · Files · Settings (5-tab mobile shell, PWA-ready, offline-safe)

---

## Table of contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Project structure](#project-structure)
4. [Quick start (clone & run)](#quick-start)
5. [Environment variables](#environment-variables)
6. [Plugging in real APIs](#plugging-in-real-apis)
7. [Production build](#production-build)
8. [Docker](#docker)
9. [Deployment targets](#deployment-targets)
10. [Backend contract (REST + WS)](#backend-contract)
11. [State management](#state-management)
12. [Mock fallback (dev mode)](#mock-fallback)
13. [PWA / offline](#pwa--offline)
14. [Testing & CI](#testing--ci)
15. [Troubleshooting](#troubleshooting)
16. [License](#license)

---

## Features

- 5-tab mobile shell with safe-area / notch handling (iOS + Android)
- Tasks list + 7-tab task detail (Overview, Reasoning, Logs, Files, Changes, Tests, Approvals)
- ChatGPT-style chat with model selector, attachments, voice button
- Live terminal with WebSocket / SSE streaming + exponential-backoff reconnect
- File explorer + in-browser code editor (save via API)
- Settings: agents, providers, model routing, permissions
- Zustand store for workspace / agent / model context (persisted)
- PWA: manifest, service worker, offline banner, cached app shell
- Vitest integration tests (api + stream)
- GitHub Actions CI (lint → test → docker build)
- Multi-stage Bun Dockerfile + docker-compose

## Tech stack

| Layer | Choice |
|---|---|
| Framework | TanStack Start v1 (file-based routing, SSR-capable) |
| UI | React 19 + Tailwind v4 + shadcn/ui |
| State | Zustand (persisted) + TanStack Query |
| Runtime | Bun (Node 20+ also supported) |
| Build | Vite 7 |
| Testing | Vitest |
| PWA | vite-plugin-pwa (Workbox) |
| Container | Multi-stage Dockerfile (Bun slim) |

## Project structure

```
.
├── Dockerfile
├── docker-compose.yml
├── .github/workflows/ci.yml
├── .env.example
├── vite.config.ts
├── vitest.config.ts
├── package.json
├── public/
│   ├── manifest.webmanifest
│   └── icons/
└── src/
    ├── routes/                # File-based routes
    │   ├── __root.tsx
    │   ├── index.tsx          # redirects to /tasks
    │   ├── tasks.tsx
    │   ├── tasks.$id.tsx
    │   ├── chat.tsx
    │   ├── terminal.tsx
    │   ├── files.tsx
    │   ├── files.$.tsx
    │   ├── settings.tsx
    │   └── api/               # Server routes (HTTP endpoints)
    ├── components/
    │   ├── layout/            # AppShell, TopHeader, BottomTabs
    │   ├── OfflineBanner.tsx
    │   └── ui/                # shadcn primitives
    ├── lib/
    │   ├── api.ts             # HTTP client + mock fallback
    │   ├── stream.ts          # WS/SSE harness w/ reconnect
    │   ├── store.ts           # Zustand: workspace/agent/model
    │   ├── mock-data.ts       # Seeded fallback data
    │   ├── pwa.ts             # Guarded SW registration
    │   └── __tests__/
    ├── styles.css             # Design tokens (oklch)
    ├── router.tsx
    └── start.ts
```

## Quick start

Requirements: **Bun ≥ 1.1** (or **Node ≥ 20** + npm/pnpm).

```bash
git clone <your-repo-url> omena-codex
cd omena-codex
bun install
cp .env.example .env            # leave blank to run in mock mode
bun dev                         # http://localhost:5173
```

Mock mode runs the full UI with seeded data — no backend required.

## Environment variables

Copy `.env.example` → `.env`. Only `VITE_*` vars are bundled into the frontend.

| Variable | Scope | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | client | Real REST API base. Empty → mock mode. |
| `VITE_WS_URL` | client | WebSocket URL for terminal log stream. |
| `OPENAI_API_KEY` | server | Provider key (never exposed to frontend) |
| `ANTHROPIC_API_KEY` | server | |
| `GOOGLE_GENERATIVE_AI_API_KEY` | server | |
| `DEEPSEEK_API_KEY` | server | |
| `XAI_API_KEY` | server | |
| `MISTRAL_API_KEY` | server | |
| `CUSTOM_MODEL_BASE_URL` | server | Self-hosted / OpenAI-compatible endpoint |
| `CUSTOM_MODEL_API_KEY` | server | |

> `VITE_*` values are **baked into the bundle at build time** — set them before `bun run build`, not at runtime.

## Plugging in real APIs

The only place you wire a backend is `src/lib/api.ts`. It reads `VITE_API_BASE_URL` once:

```ts
const BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const USE_MOCK = !BASE;
```

When `VITE_API_BASE_URL` is set, every function (`getTasks`, `sendChatMessage`, `getFiles`, …) hits HTTP instead of returning seeded mocks. Same for `VITE_WS_URL` in `src/lib/stream.ts`.

**To disable mocks in production:** set both env vars to non-empty values before building. No code change needed.

## Authentication

The API client (`src/lib/api.ts`) attaches a bearer token to every outgoing
request and sends `credentials: "include"` so backends can also rely on
HttpOnly session cookies.

```ts
import { setAuthToken, getAuthToken } from "@/lib/api";

setAuthToken("eyJhbGciOi...");   // after sign-in (stored in localStorage)
setAuthToken(null);              // on sign-out
```

- Header sent: `Authorization: Bearer <token>` on every `fetch()` call.
- Storage key: `omena.auth.token` in `localStorage`.
- The client token is **advisory only** — the backend MUST enforce
  authentication and per-user/per-workspace authorization on every endpoint.
  Never trust the client.
- `useApp().permissions` (auto-approve, network, file writes) are **UI hints
  only**. They are sent with agent requests so the backend can log intent,
  but the backend is the source of truth for what the agent may actually do.
- HTTP errors are mapped to safe user-facing messages by status code
  (401/403/404/408/429/5xx). Raw response bodies are logged to the developer
  console only — never surfaced to the UI — to avoid leaking stack traces or
  internal schemas.

## Production build

```bash
export VITE_API_BASE_URL="https://api.your-domain.com"
export VITE_WS_URL="wss://api.your-domain.com/ws"

bun run build          # → dist/
bun run preview        # smoke-test locally on :3000
```

Output is a standard Node/Bun server: `dist/server/index.mjs`.

## Docker

```bash
# Build with baked-in URLs
docker build -t omena-codex \
  --build-arg VITE_API_BASE_URL=https://api.your-domain.com \
  --build-arg VITE_WS_URL=wss://api.your-domain.com/ws .

docker run -p 3000:3000 omena-codex
```

Or use compose (reads `.env`):

```bash
docker compose up -d --build
```

## Deployment targets

| Target | How |
|---|---|
| **VPS** | `docker compose up -d` behind nginx/Caddy with TLS |
| **Cloudflare Workers** | `bunx wrangler deploy` — `vite.config.ts` already targets workerd |
| **Fly.io / Render / Railway** | Point at the included `Dockerfile` |
| **Vercel / Netlify** | Import repo, set `VITE_*` in project env, build cmd: `bun run build` |
| **Kubernetes** | Use the Docker image; mount env from a ConfigMap/Secret |

Routes work on hard refresh (TanStack handles SPA fallback — no `_redirects` or `vercel.json` needed).

## Backend contract

Implement these endpoints to replace the mocks. Types live in `src/lib/mock-data.ts`.

### REST

| Method | Path | Returns |
|---|---|---|
| GET | `/tasks` | `Task[]` |
| GET | `/tasks/:id` | `Task` |
| POST | `/tasks` | `Task` (body: `{title, prompt, agent}`) |
| GET | `/tasks/:id/diffs` | `{staged, unstaged, taskId}` |
| GET | `/tasks/:id/tests` | `TestsResult` |
| GET | `/chat/messages` | `ChatMessage[]` |
| POST | `/chat/messages` | `ChatMessage` (assistant reply) |
| GET | `/terminal/logs` | `TerminalLine[]` |
| POST | `/commands/:id/approve` | `{ok: true}` |
| POST | `/commands/:id/reject` | `{ok: true}` |
| GET | `/files` | `FileNode` (tree) |
| GET | `/files/:path/content` | raw text |
| PUT | `/files/:path/content` | `{ok: true}` |
| GET | `/providers` | `Provider[]` |
| PATCH | `/providers/:id` | updated provider |
| GET | `/models` | `ModelOption[]` |
| POST | `/models/:id/activate` | `{ok: true}` |
| GET | `/agents` | `Agent[]` |
| PATCH | `/agents/:id` | updated agent |
| GET | `/workspaces` | `Workspace[]` |
| POST | `/workspaces/:id/activate` | `{ok: true}` |
| GET | `/notifications` | `Notification[]` |

### WebSocket

`VITE_WS_URL` should emit newline-delimited or per-message JSON matching:

```ts
interface TerminalLine {
  id: string;
  stream: "stdout" | "stderr";
  text: string;
  ts: string;        // ISO 8601
}
```

The client auto-reconnects with exponential backoff.

## State management

`src/lib/store.ts` (Zustand, persisted to `localStorage`):

```ts
const { workspaceId, agentId, modelId,
        setWorkspace, setAgent, setModel } = useApp();
```

Read it anywhere — the top header, chat composer, and task creation all source context from this single store.

## Mock fallback

Located in `src/lib/mock-data.ts`. Used automatically when `VITE_API_BASE_URL` is empty. To disable in production, simply set the env var at build time.

## PWA / offline

- Manifest: `public/manifest.webmanifest`
- Icons: `public/icons/`
- Service worker registration: `src/lib/pwa.ts` (auto-disabled in dev + Lovable preview)
- Offline banner: `src/components/OfflineBanner.tsx`
- Cached: app shell + last-fetched task/chat/file data

Service worker registers **only in production builds on your own domain**.

## Testing & CI

```bash
bun test           # vitest run (api + stream tests)
bun test:watch
bun lint
```

`.github/workflows/ci.yml` runs lint → test → build, then a Docker image
build on `main`. The install step is pinned for reproducibility:

```yaml
- uses: oven-sh/setup-bun@v2
  with: { bun-version: "1.3.3" }
- run: bun install --frozen-lockfile --no-cache --registry=https://registry.npmjs.org
```

Notes:
- `--registry=https://registry.npmjs.org` forces public npm resolution, avoiding
  stale private-registry tarball URLs that previously broke `bun install` in CI.
- `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` is set workflow-wide to silence
  the GitHub Actions Node.js 20 deprecation warning.
- The Docker job builds against the project `Dockerfile`, which copies the
  Vite SSR output from `/app/dist` and runs `bun dist/server/index.mjs`
  (NOT `.output/` — that's a legacy path from older TanStack Start versions).


## Troubleshooting

| Symptom | Fix |
|---|---|
| UI still shows seeded data after deploy | `VITE_API_BASE_URL` was empty at build time. Rebuild with the env set. |
| Terminal shows mock log lines | Set `VITE_WS_URL` and rebuild. |
| 404 on hard refresh | Confirm your host serves the TanStack server output, not just `dist/`. |
| CORS errors | Allow your frontend origin from the backend. WS needs the same. |
| Service worker serving stale UI | Visit `/?sw=off` once to unregister, then hard-reload. |
| iOS notch overlap | Already handled via `env(safe-area-inset-*)` in `AppShell`, `TopHeader`, `BottomTabs`. |
| Docker build fails with `.output directory not found` | You're on an old Dockerfile. Build output is now `dist/`. Pull latest `Dockerfile` + `.dockerignore`. |
| CI fails on `bun install` (integrity / 401 from private registry) | Already fixed — workflow installs with `--no-cache --registry=https://registry.npmjs.org`. If forking, keep those flags. |
| 401/403 from backend after login | Call `setAuthToken(token)` from `@/lib/api` after sign-in; verify the backend accepts `Authorization: Bearer ...` and your CORS allows the `Authorization` header + `credentials`. |

## License

MIT. Own it, fork it, ship it.

## Milestone 1 — Auth Foundation (completed)

The app now boots on Lovable Cloud (Supabase) with real authentication:

- All app tabs (Tasks, Chat, Terminal, Files, Settings, Dashboard) live under the `_authenticated` layout. Unauthenticated visitors are redirected to `/auth`.
- `/auth` supports Email/Password and Google OAuth (managed by Lovable Cloud — no extra setup).
- The first user to sign up is automatically promoted to `admin`; subsequent users get the `member` role.
- Schema: `profiles`, `user_roles`, `workspaces`, `servers`, `provider_configs`, `conversations`, `messages`, `tasks`, `notifications`, `audit_log`, `approvals` — all RLS-protected. `provider_configs.api_key_encrypted` and `servers.daemon_token` are server-side only.
- Server functions for provider CRUD live in `src/lib/providers.functions.ts` (admin-only via RLS).
- Sign out from **Settings → Danger Zone → Sign Out**.

### Required environment variables

Client (auto-populated by Lovable Cloud, also in `.env.example`):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_SUPABASE_PROJECT_ID=...
```

Server-only (managed by Lovable Cloud secrets, set automatically):

```
SUPABASE_URL=...
SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # never exposed to the browser
LOVABLE_API_KEY=...             # used by the AI Gateway in M2
```

### Deploy / self-host

- **Lovable hosting**: click *Publish* — auth, DB, and secrets are wired automatically.
- **Self-host (Docker)**: `docker compose up --build`. Provide the `VITE_SUPABASE_*` variables at build time and the server-only secrets at runtime. The Cloudflare Worker SSR build runs `npm run build`; the container serves the `.output/` artifact on port 3000.

### Roadmap

- **M2** — Streaming chat via Lovable AI Gateway, provider selector, web search & tools, persisted conversations.
- **M3** — `agent-daemon/` Node WebSocket server for real terminal + file system per registered server.
- **M4** — Permission enforcement, approval queue, audit log + realtime notifications.
- **M5** — Rate limits, secret rotation, backups, production hardening.

---

## Milestone 3 — Tool Executor & Approval Queue

M3 replaces the M2 no-op tool stubs with a real execution layer that is still
safe by default: nothing dangerous can run from Lovable hosting yet.

### Tool executor

`src/lib/tools/executor.server.ts` is the single entry point for every tool
call from `/api/chat`. It:

1. Classifies the call via `src/lib/tools/risk.ts` (safe / restricted /
   dangerous) based on tool name, file paths, and command patterns.
2. Routes by risk:
   - **safe** → runs in the active workspace's adapter mode and returns data.
   - **restricted / dangerous** → does NOT execute. Creates an `approvals`
     row and returns `{ pending: true, approvalId }` to the model.
3. Adapter modes: `mock` (default), `dry-run`, `remote-agent` (stub), `ssh`
   (stub). Resolved from the workspace's linked `servers.adapter_mode`.

### Risk classifier

`src/lib/tools/risk.ts` — pure, client-safe.

| Risk | Examples |
| --- | --- |
| safe | `plan`, `web_search`, `read_file` of non-sensitive paths |
| restricted | `write_file`, `run_command` (build/test/git/docker/mv/cp …) |
| dangerous | `rm -rf`, `mkfs`, `dd`, `sudo`, `curl \| sh`, paths matching `.ssh`, `.aws`, `.env`, `.git`, `id_rsa`, etc. |

### Approval queue

`approvals` table (extended in this milestone):

| Column | Notes |
| --- | --- |
| `id` | UUID |
| `requested_by` | user id |
| `conversation_id` | links back to chat |
| `workspace_id` | nullable |
| `tool_name`, `action` | which tool fired |
| `risk_level` | safe / restricted / dangerous |
| `input_summary` | short preview shown in the UI |
| `payload` | full JSON input |
| `status` | pending / approved / denied / expired |
| `expires_at` | default 24h |
| `created_at`, `decided_at`, `decided_by` | audit fields |

RLS:
- Any authenticated user can SELECT approvals (so the UI can render them).
- Only admins can decide approvals.
- The original requester can update (cancel) their own row.

Server functions (`src/lib/approvals.functions.ts`): `listApprovals`,
`resolveApproval`, `cancelApproval`.

UI: `/approvals` shows Pending & Resolved tabs with Approve / Reject buttons
and a 5-second poll while on Pending. Linked from Settings → Approvals.

### Server-agent contract (schema only)

`servers` table now carries everything the future agent-daemon needs:

| Column | Purpose |
| --- | --- |
| `daemon_url` | agent endpoint |
| `daemon_token` | bearer token (server-only) |
| `workspace_root` | path on the remote host |
| `enabled` | toggle without deletion |
| `adapter_mode` | mock / dry-run / remote-agent / ssh |
| `last_health_at` | last successful health check |

No outbound connection is opened yet — `remote-agent` and `ssh` modes fall
back to mock and surface a "not yet connected" note.

### Constraints honored

- No AWS, no raw SSH, no shell execution from Lovable hosting.
- Dangerous tools never auto-run; they require explicit approval.
- Provider keys remain server-only.
- RLS unchanged in spirit; new policy only widens UPDATE to the requester.
- UI design preserved (dark mobile-first, rounded cards).

### Still mock / dry-run

- `read_file` (returns synthetic content)
- `web_search` (returns empty results + advisory note)
- Approved restricted / dangerous tools (execution stub awaits M4 adapter)

### Ready for M4

- Real workspace adapter implementations (remote-agent first).
- Server-agent health checks (writing `last_health_at`).
- Audit log row per approval decision + executed tool result.
- Realtime notifications when an approval is created or resolved.
