## Reality check

This request is ~3–6 weeks of full-stack work (auth, DB, encrypted secrets, SSH/terminal bridge, file sync, provider registry, streaming, audit log, approvals). I can't ship all of it in one turn without producing broken half-features. I'll deliver it as **5 milestones**, each one fully working end-to-end before moving on. You approve this plan, then I build M1. After M1 works you say "go" and I build M2, etc.

## Architecture (final shape)

```text
┌─────────────────────────────────────┐        ┌──────────────────────────┐
│  Lovable app (Cloudflare Worker)    │        │  Your server (omenacore) │
│  ─ TanStack Start UI (current dark  │        │  ─ omena-agentd (Node)   │
│    mobile-first design, untouched)  │        │    • WS server (token)   │
│  ─ Server fns + /api/* routes       │ <───WS─│    • pty terminal sess.  │
│  ─ Lovable Cloud (Supabase):        │        │    • fs read/write/list  │
│     auth, postgres, storage,        │        │    • file watcher        │
│     secrets vault                   │        │    • audit -> app DB     │
│  ─ AI: Lovable AI Gateway +         │        │  ─ systemd unit + .env   │
│    user-supplied provider keys      │        └──────────────────────────┘
└─────────────────────────────────────┘
```

Workers cannot SSH or spawn shells, so a **small daemon** (`/agent-daemon/`) runs on each server and the app talks to it over an authenticated WebSocket. Daemon is bundled in this repo but deployed separately.

## Decisions I'm making for you

- **Lovable Cloud: ON.** Required for auth, DB, encrypted secrets, file uploads. No way to build this realistically without it.
- **AI providers: BYO keys + Lovable AI Gateway fallback.** Provider registry table with encrypted keys; gateway used when no key is set or as the default.
- **Daemon: scaffolded in this repo** under `agent-daemon/` with README + systemd unit; you deploy it per server.
- **Auth: email + password + Google** (Lovable Cloud defaults). Single-tenant — first signup becomes admin, others must be invited.
- **UI: preserved exactly.** Only the data layer changes. New screens added only where missing (provider registry, server connections, approvals queue).

## Milestone 1 — Foundation (this turn, after you approve)

1. Enable Lovable Cloud.
2. DB schema + RLS + grants:
   - `profiles`, `app_role` enum, `user_roles`, `has_role()` (admin/member)
   - `workspaces` (name, path, server_id, env_json)
   - `servers` (name, host, daemon_url, daemon_token_encrypted, status)
   - `provider_configs` (kind, name, base_url, api_key_encrypted, default_model, enabled)
   - `conversations`, `messages` (UIMessage parts)
   - `tasks` (status enum, agent_id, workspace_id, progress, logs jsonb)
   - `notifications` (severity, read, link)
   - `audit_log` (actor, action, target, payload, approved_by)
   - `approvals` (action, status, requested_by, decided_by)
3. Auth wired (`/auth` + `_authenticated` gate already used by integration).
4. `setAuthToken` removed from the advisory localStorage path; replaced with real Supabase session + `attachSupabaseAuth` global middleware.
5. Server functions + zod validators for all CRUD.
6. Settings → Providers, Servers, Workspaces screens (real forms, encrypted writes via service-role server fn after `has_role` check).
7. `.env.example`, README, Dockerfile updated for the new env contract.

After M1: you can sign up, log in, add a provider key, define a server + workspace. Nothing else functional yet.

## Milestone 2 — Chat + Agent + Tasks

- `/api/chat` streaming route using AI SDK + Lovable AI Gateway provider helper.
- Provider selector reads from `provider_configs`; encrypted keys decrypted server-side only.
- Web search tool (if user enables Web switch) via `websearch` tool.
- Tools switch: enables `read_file`, `write_file`, `list_dir`, `run_command` (the last two go through the daemon — gated until M3).
- Chat persists per-conversation, threaded routing at `/chat/$conversationId`.
- File/image upload to Lovable Cloud Storage; AI sees attachments.
- Agent creates/updates rows in `tasks` as it works; live progress via Supabase realtime.

## Milestone 3 — Agent Daemon + Terminal + Files

- `agent-daemon/` package: Node WS server, JWT auth, command exec via `node-pty`, FS API, file watcher, rate limits.
- `Dockerfile`, `systemd` unit, install script, README with setup steps.
- App ↔ daemon WS bridge through a server route that proxies (Worker → daemon).
- Terminal tab wires to real PTY sessions per workspace.
- Files tab wires to real FS via daemon.
- Server connection test button in Settings → Servers.

## Milestone 4 — Permissions, Approvals, Audit

- Permission toggles wired to backend enforcement (not advisory).
- Risky actions (`rm -rf`, package install, deploy, file delete) create rows in `approvals`; UI shows queue; admin approves/denies.
- Every agent action writes to `audit_log`.
- Notifications generated from real events (approval needed, task failed, daemon disconnected, etc.) via DB triggers + realtime.

## Milestone 5 — Polish + Deploy hardening

- Rate limiting on chat/exec endpoints.
- Secret rotation flow.
- Backup/export tools.
- README finalized with deploy guides: Lovable hosting (default), self-host via Docker Compose, daemon install per server.
- Production checklist + smoke tests.

## What I will NOT do without explicit approval

- Touch the visible UI (colors, layout, tabs, components). New screens only where features are missing.
- Add SSH key handling (the daemon model is safer and avoids storing private keys in the app).
- Implement arbitrary "self-modifying agent" loops without the approvals gate from M4.

## Confirm to proceed

Reply **"go M1"** and I start Milestone 1 immediately (enable Cloud, write migrations, scaffold provider/server/workspace screens, update README + .env.example). If you want changes to scope, tell me which milestone to adjust.
