# Deployment Guide

This guide covers self-hosting **Omena Codex** end-to-end on your own VPS or
cloud VM. The same stack also runs on a developer laptop — see the Quick
Start section for that path.

> Browser-agent is **disabled by default**. Skip section 6 entirely if you
> don't need browser automation.

---

## 1. Architecture

```
                ┌────────────────────────┐
   user (browser) ── HTTPS ──> │ reverse proxy (Caddy)  │
                ├────────────────────────┤
                │  app (TanStack Start)  │ ──► Supabase (auth/db/storage)
                └────────────────────────┘ ──► Lovable AI Gateway / OpenAI
                              │
                              ├──► server-agent (per VPS, token-gated)
                              │       └── /workspace on host
                              └──► browser-agent (OPTIONAL, opt-in)
                                      └── headless Chromium
```

- The **app** is a stateless web server. It can run anywhere that supports
  Node 22 / Bun. The Dockerfile in repo root builds the production image.
- The **server-agent** is a small daemon you run on each machine that
  should expose a workspace + shell. Communication is HTTPS + bearer token.
- The **browser-agent** is an opt-in service for web navigation tasks.

## 2. Prerequisites

- Ubuntu 22.04+ VPS (4 GB RAM minimum, 8 GB recommended).
- A domain name with DNS pointing at the VPS.
- A Supabase project (Lovable Cloud or self-managed Supabase).
- A model provider: Lovable AI Gateway key, OpenAI key, or compatible.

## 3. VPS bootstrap (Ubuntu)

```bash
# 1. Install Docker + compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# 2. Clone repo
git clone https://github.com/<you>/<repo>.git omena-codex
cd omena-codex

# 3. Generate tokens
echo "SERVER_AGENT_TOKEN=$(openssl rand -hex 32)" >> .env.tokens
echo "BROWSER_AGENT_TOKEN=$(openssl rand -hex 32)" >> .env.tokens
echo "WEBHOOK_SECRET=$(openssl rand -hex 32)"     >> .env.tokens

# 4. Build .env
cp .env.example .env
cat .env.tokens >> .env
rm .env.tokens
# then edit .env — fill VITE_SUPABASE_*, SUPABASE_*, LOVABLE_API_KEY, DOMAIN
nano .env

# 5. Start the stack
docker compose up -d --build app server-agent

# 6. Verify
./scripts/verify-all.sh
curl -fsS http://localhost:3000/ >/dev/null && echo "app up"
```

## 4. Reverse proxy + TLS (Caddy)

1. Point your DNS A record at the VPS public IP.
2. Uncomment the `caddy` service in `docker-compose.yml`.
3. Create `deploy/Caddyfile`:

   ```
   {$DOMAIN} {
     reverse_proxy app:3000
     encode zstd gzip
     header {
       Strict-Transport-Security "max-age=31536000; includeSubDomains"
       X-Content-Type-Options nosniff
       Referrer-Policy strict-origin-when-cross-origin
     }
   }
   ```

4. `docker compose up -d caddy`. Caddy issues a Let's Encrypt cert
   automatically on first request to `https://$DOMAIN`.

## 5. Server-agent setup

The server-agent ships as part of the compose stack. It:

- Binds to `127.0.0.1:8787` (never exposed publicly).
- Mounts `${SERVER_AGENT_WORKSPACE}` (default `./workspace`) as `/workspace`.
- Refuses requests without `Authorization: Bearer ${SERVER_AGENT_TOKEN}`.
- Blocks traversal outside the workspace and reads of secret/system paths.

To register it in the UI:

1. Sign in as the admin user (the first signed-up user is auto-admin).
2. Go to **Settings → Servers → Add server**.
3. Daemon URL: `http://server-agent:8787` (or `https://server.example.com`
   if the daemon runs on another host behind your proxy).
4. Token: the `SERVER_AGENT_TOKEN` you generated.
5. Save → click **Health check** → expect green.

## 6. Browser-agent (OPTIONAL)

The browser-agent is shipped as scaffold + Dockerfile. To activate:

1. Uncomment the `browser-agent` service in `docker-compose.yml`.
2. Extend `browser-agent/Dockerfile` to install Playwright + Chromium:
   ```dockerfile
   RUN npx playwright install --with-deps chromium
   ```
3. Set `BROWSER_AGENT_URL=http://browser-agent:8788` and
   `BROWSER_AGENT_TOKEN=<token>` in `.env`.
4. Restart the app: `docker compose up -d app browser-agent`.
5. Verify `/health` dashboard shows browser-agent green.

Browser actions are classified `restricted` or `dangerous` and require human
approval via the **Approvals** screen — no autonomous browsing.

## 7. Database / Supabase

Lovable Cloud provisions Supabase for you. For a fully self-managed
Supabase, point `VITE_SUPABASE_URL` + `SUPABASE_URL` at your instance and
copy the publishable + service-role keys.

Migrations live in `supabase/migrations/`. Apply them with the Supabase CLI
or via the dashboard SQL editor. RLS policies are mandatory on every public
table — do not edit migrations to weaken them.

## 8. Upgrades

```bash
cd ~/omena-codex
git pull --ff-only
docker compose pull
docker compose up -d --build
./scripts/verify-all.sh
```

Roll back by checking out the previous commit + rebuilding.

## 9. Backups

See [docs/AGENTS.md §Backup](./AGENTS.md#backup--restore) and the
[`docs/SECURITY.md`](./SECURITY.md) production checklist.
