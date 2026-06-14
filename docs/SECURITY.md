# Security Hardening

Production checklist for self-hosted Omena Codex. Tick every item before
exposing the app to the public internet.

## Identity & access

- [ ] First-user-is-admin migration applied (`handle_new_user` trigger).
- [ ] Disable anonymous sign-ups in Supabase Auth.
- [ ] Configure Google OAuth via Lovable broker (NOT raw Supabase OAuth).
- [ ] RLS enabled on **every** public table; no table grants `anon` write.
- [ ] `has_role()` function used for all admin checks. Roles live in
      `user_roles` — never on `profiles`.

## Tokens & secrets

- [ ] `SERVER_AGENT_TOKEN` and `BROWSER_AGENT_TOKEN` are >=32 random bytes.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is set as a server-only env var. Never
      logged, never returned by a server function, never imported at module
      scope in `*.functions.ts` files.
- [ ] `WEBHOOK_SECRET` set; every `/api/public/*` route verifies its HMAC
      signature with `crypto.timingSafeEqual`.
- [ ] Provider API keys stored in Settings → Providers (encrypted at rest)
      OR in env, never both. Client-side code references only publishable
      keys (`VITE_*`).
- [ ] Token rotation runbook reviewed (see [AGENTS.md](./AGENTS.md)).

## Network

- [ ] App served exclusively over HTTPS. HSTS header set (Caddyfile sample
      in [DEPLOYMENT.md](./DEPLOYMENT.md)).
- [ ] Server-agent and browser-agent bound to `127.0.0.1` or a private VPC
      network. Never expose 8787/8788 directly to the public internet.
- [ ] CORS on `/api/public/*` locked to the published origin(s).
- [ ] No raw SSH from the app to any host. Server-agent is the ONLY
      remote execution path.

## Browser-agent (if enabled)

- [ ] `BROWSER_AGENT_URL` uses HTTPS in production.
- [ ] `BROWSER_AGENT_ALLOWED_ORIGINS` set — empty list = wildcard;
      production should enumerate the exact domains the agent may visit.
- [ ] SSRF guard verified: `safety.ts` rejects loopback, link-local,
      `10/8`, `172.16/12`, `192.168/16`, `169.254/16`.
- [ ] Disallowed URL schemes (`javascript:`, `file:`, `data:`, …) refused.
- [ ] All browser tools mapped to `restricted` or `dangerous` risk in
      `src/lib/tools/risk.ts`. Approvals required before execution.

## Server-agent

- [ ] `WORKSPACE_ROOT` is a dedicated directory, not `/`, `/home`, `/etc`,
      `/root`, `/usr`, `/var`, `/proc`, `/sys`.
- [ ] Path traversal blocked (`assertSafeRelativePath`).
- [ ] Secret patterns blocked (`.env`, `.git`, `.ssh`, `.aws`, `id_*`,
      `*.pem`, `*.key`, credential/token files).
- [ ] Commands run with a minimal `PATH`-only env. No shell vars leaked.

## Approvals & audit

- [ ] Approval mode set to **require** for all `restricted` + `dangerous`
      tool calls.
- [ ] Audit log retention configured. Audit rows MUST capture: actor,
      tool, args summary, risk, approval decision, outcome.
- [ ] Log redaction: never log `Authorization` headers, daemon tokens,
      `SUPABASE_SERVICE_ROLE_KEY`, or user passwords.
- [ ] Rate limits enforced on mission start + tool execution (server-side).

## What we deliberately do NOT do

- No CAPTCHA bypass, no stealth/anti-detection browsing.
- No autonomous payment, banking, or identity automation.
- No unrestricted filesystem access — every read/write goes through the
  workspace allowlist.
- No raw SSH key handling from the app.
- No headless browser persistence of third-party credentials.

## Reporting

Found a vulnerability? Open a private security advisory on the repo —
do not file a public issue.
