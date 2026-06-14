# Troubleshooting

## App container won't start

- `docker compose logs app` — look for a missing env var. The app crashes
  fast when `SUPABASE_URL` or `SUPABASE_PUBLISHABLE_KEY` is empty.
- Confirm `.env` is in the same directory as `docker-compose.yml`.
- Rebuild: `docker compose build --no-cache app`.

## "Unauthorized: No authorization header provided"

A server function uses `requireSupabaseAuth` but the client isn't
attaching the bearer. Check `src/start.ts`:

```ts
import { attachSupabaseAuth } from '@/integrations/supabase/auth-attacher';
export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
  functionMiddleware: [attachSupabaseAuth],
}));
```

## Server-agent health check fails

1. `docker compose logs server-agent` — daemon refuses on missing token.
2. Confirm the URL in **Settings → Servers** is reachable from the app
   container (`http://server-agent:8787` for in-compose; the public
   FQDN otherwise).
3. Confirm the token matches.
4. Test from the host: `curl -H "Authorization: Bearer $TOKEN"
   http://localhost:8787/health`.

## Browser-agent disabled

Expected. The app hides browser tools until both `BROWSER_AGENT_URL` and
`BROWSER_AGENT_TOKEN` are set. See [BROWSER_AGENT.md](./BROWSER_AGENT.md).

## Approvals never appear

Tools classified `safe` auto-execute and never raise approvals. Check
the tool's risk in `src/lib/tools/risk.ts` — if it should be gated,
ensure it's mapped to `restricted` or `dangerous`.

## "h3 swallowed SSR error"

`src/server.ts` already normalises this to the friendly error page.
The actual error is logged in the container stdout above the swallow
message — search for `Error:` just before the swallow line.

## Audit log empty

Audit rows are written by the executor after each tool call. If empty:
1. Confirm the mission actually executed a tool (status != `planning`).
2. Confirm the user has SELECT permission on `audit_log` (RLS policy).

## Database migrations stuck

Apply the latest migration via Supabase dashboard SQL editor. Migrations
in `supabase/migrations/` are timestamp-prefixed and idempotent.

## Verification script fails

`./scripts/verify-all.sh` runs lint, typecheck, test, build, and health
probes. Re-run with `bash -x` to see which step failed and consult the
relevant section above.
