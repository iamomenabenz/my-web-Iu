#!/usr/bin/env bash
# Full-stack verification for Omena Codex.
# Runs every check we expect to pass before a production deploy.
#
# Usage:
#   ./scripts/verify-all.sh            # local checks only
#   APP_URL=https://codex.example.com ./scripts/verify-all.sh   # + remote probes

set -euo pipefail

cd "$(dirname "$0")/.."

green() { printf "\033[32m✓\033[0m %s\n" "$*"; }
red()   { printf "\033[31m✗\033[0m %s\n" "$*"; }
step()  { printf "\n\033[1m▶ %s\033[0m\n" "$*"; }

# ---- 1. Root app ----------------------------------------------------------
step "Root app: lint / typecheck / test / build"
bun run lint
bun run typecheck
bun run test
bun run build
green "Root app checks passed"

# ---- 2. Server-agent ------------------------------------------------------
step "Server-agent: typecheck / build"
( cd server-agent && npm run typecheck && npm run build )
green "Server-agent checks passed"

# ---- 3. Browser-agent (scaffold) ------------------------------------------
step "Browser-agent: typecheck / build"
( cd browser-agent && npm run typecheck && npm run build )
green "Browser-agent checks passed"

# ---- 4. Env validation ----------------------------------------------------
step "Env validation"
missing=()
for var in VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY SUPABASE_URL SUPABASE_PUBLISHABLE_KEY; do
  if [ -z "${!var:-}" ]; then missing+=("$var"); fi
done
if [ ${#missing[@]} -gt 0 ]; then
  red "Missing required env vars: ${missing[*]}"
  red "  (this is OK for local CI; required before docker compose up in prod)"
else
  green "All required public Supabase env vars present"
fi

# Browser-agent should stay disabled unless BOTH vars are set.
if [ -n "${BROWSER_AGENT_URL:-}" ] && [ -n "${BROWSER_AGENT_TOKEN:-}" ]; then
  green "Browser-agent configured (will be ENABLED)"
elif [ -n "${BROWSER_AGENT_URL:-}" ] || [ -n "${BROWSER_AGENT_TOKEN:-}" ]; then
  red "Browser-agent partially configured — set BOTH BROWSER_AGENT_URL and BROWSER_AGENT_TOKEN, or neither"
  exit 1
else
  green "Browser-agent disabled (default) — tools hidden from planner"
fi

# ---- 5. Remote health probes (optional) -----------------------------------
if [ -n "${APP_URL:-}" ]; then
  step "Remote: app health"
  curl -fsS "${APP_URL}/" >/dev/null && green "App responding at ${APP_URL}"
fi

if [ -n "${SERVER_AGENT_URL:-}" ] && [ -n "${SERVER_AGENT_TOKEN:-}" ]; then
  step "Remote: server-agent health"
  curl -fsS -H "Authorization: Bearer ${SERVER_AGENT_TOKEN}" \
       "${SERVER_AGENT_URL%/}/health" >/dev/null \
    && green "Server-agent healthy at ${SERVER_AGENT_URL}"
fi

if [ -n "${BROWSER_AGENT_URL:-}" ] && [ -n "${BROWSER_AGENT_TOKEN:-}" ]; then
  step "Remote: browser-agent health"
  curl -fsS -H "Authorization: Bearer ${BROWSER_AGENT_TOKEN}" \
       "${BROWSER_AGENT_URL%/}/health" >/dev/null \
    && green "Browser-agent healthy at ${BROWSER_AGENT_URL}"
fi

printf "\n\033[1;32mAll verification steps passed.\033[0m\n"
