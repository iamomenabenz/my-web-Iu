# Agents

Omena Codex talks to two kinds of agents over HTTPS + bearer token.

## Server-agent

Lives in `server-agent/`. A small Node daemon that exposes:

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | liveness + version |
| `GET /workspace/info` | reports workspace root + writability |
| `GET /files/list` | directory listing, scoped to workspace |
| `POST /files/read` / `/write` / `/delete` | scoped file IO |
| `POST /files/search` | substring search across workspace |
| `POST /commands/run` / `/stop` | shell command exec with timeout |
| `GET /commands/logs` | recent command output |

Every call requires `Authorization: Bearer ${DAEMON_TOKEN}`.

Safety guarantees:

- Workspace root cannot be `/`, `/home`, `/etc`, `/root`, `/proc`, `/sys`,
  `/dev`, `/run`, `/tmp`, `/usr`, `/var`, `/opt`.
- Paths are normalized + checked to prevent traversal.
- Secret patterns (`.env`, `.git`, `.ssh`, `.aws`, `id_rsa`, `*.pem`,
  `*.key`, `credentials`, `secrets`, `tokens`) are rejected.
- Commands run with a minimal `PATH`-only env and a hard timeout.

Configuration: `server-agent/.env.example`. Defaults:

- `PORT=8787`
- `COMMAND_TIMEOUT_MS=60000`
- `MAX_FILE_BYTES=1048576`
- `MAX_SEARCH_RESULTS=100`

## Browser-agent (opt-in)

Lives in `browser-agent/`. **Scaffold only** — ships disabled. The app
hides browser tools from the planner and refuses to execute them until
both `BROWSER_AGENT_URL` and `BROWSER_AGENT_TOKEN` are set.

To activate, see [docs/BROWSER_AGENT.md](./BROWSER_AGENT.md).

## Backup & restore

### What to back up

- **Supabase database** — auth users, missions, audit logs, providers,
  servers, approvals. Export from Supabase dashboard → Database → Backups,
  or `pg_dump` against `SUPABASE_DB_URL`.
- **Workspace** — the host directory mounted at `/workspace` inside the
  server-agent. Plain tar/rsync.
- **Env file** — `.env` (store encrypted; contains every token).

### Restore on a new VPS

1. Follow [DEPLOYMENT.md §3](./DEPLOYMENT.md#3-vps-bootstrap-ubuntu).
2. Restore `.env` from your secure backup.
3. Restore the workspace tarball into `${SERVER_AGENT_WORKSPACE}`.
4. Restore Supabase from the dashboard or `psql < dump.sql`.
5. `docker compose up -d --build`.
6. Run `./scripts/verify-all.sh`.

### Rotating tokens safely

1. Generate a new token: `openssl rand -hex 32`.
2. Update the server in Settings → Servers (paste new token).
3. Update `.env` on the daemon host + restart that one service:
   `docker compose up -d server-agent`.
4. Health-check from the UI. Roll back by reapplying the previous token
   if the daemon fails to start.
