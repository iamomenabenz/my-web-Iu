# Omena Server Agent (M5 foundation)

A small authenticated daemon that runs on a VPS, VM, Docker container, or self-hosted server. The Lovable app talks to this daemon over HTTPS instead of spawning commands from Lovable Cloud.

## Run locally

```bash
cp .env.example .env
npm install
npm run build
DAEMON_TOKEN="replace-with-a-long-random-token" WORKSPACE_ROOT="/srv/omena/workspace" npm start
```

Put the daemon behind TLS before connecting a production app.

## Endpoints

All endpoints require `Authorization: Bearer <DAEMON_TOKEN>`.

- `GET /health`
- `GET /workspace/info`
- `GET /files/list?path=.&limit=200`
- `POST /files/read` `{ "path": "src/index.ts" }`
- `POST /files/write` `{ "path": "notes.txt", "content": "..." }`
- `POST /files/delete` `{ "path": "notes.txt" }`
- `POST /files/search` `{ "query": "TODO", "path": "." }`
- `POST /commands/run` `{ "command": "npm test", "cwd": ".", "timeoutMs": 60000 }`
- `POST /commands/stop` `{ "commandId": "..." }`
- `GET /commands/logs?limit=100`

## Safety model

- Workspace access is constrained to `WORKSPACE_ROOT`.
- Relative paths are normalized and checked to prevent traversal.
- Absolute paths are rejected.
- Secret/system paths are blocked, including `.env`, `.git`, `.ssh`, `.aws`, private-key names, credential/secret/token files, and key/cert bundles.
- Unsafe workspace roots such as `/`, `/home`, `/root`, `/etc`, `/proc`, and `/sys` are rejected.
- Commands run with a timeout and a minimal environment (`PATH` only).
- Errors are structured as `{ "ok": false, "error": "...", "code": 403 }`.

This package is intentionally dependency-light for M5. M6 can add job queues, streaming logs, richer process isolation, and deployment templates.
