# Missions

A **mission** is one autonomous run of the planner. The planner picks
tools from the registry, the executor runs each tool (subject to risk
classification + approvals), and every step is written to the audit log.

## Lifecycle

```
draft ─► planning ─► executing ─► (awaiting_approval ⇄ executing) ─► done | failed
```

- **draft** — user typed the goal, hasn't started.
- **planning** — model is choosing tools.
- **executing** — at least one tool call has run.
- **awaiting_approval** — planner picked a `restricted` or `dangerous`
  tool; UI shows the call in **Approvals** with a Diff/Args summary.
- **done** / **failed** — terminal states.

## Risk levels

Defined in `src/lib/tools/risk.ts`.

| Level | Examples | Approval |
| --- | --- | --- |
| `safe` | file read, list directory, web search | auto |
| `restricted` | file write, command run, browser navigate | required |
| `dangerous` | file delete, browser click/fill, shell with sudo-shaped command | required + extra confirmation |

Approval mode can be tightened (never auto) per-server or globally in
Settings.

## Tool registry

`src/lib/tools/registry.ts`. Each tool declares:

- `name`, `description`, `inputSchema`
- `risk` (see above)
- `requiresRemoteAgent` / `requiresBrowserAgent` flags

The planner only sees tools whose required agent is configured. With no
server-agent configured, only safe in-process tools are offered. With no
browser-agent configured, all `browser_*` tools are hidden.

## Audit log

Every tool execution writes an `audit_log` row: actor, tool, sanitized
args, risk, approval decision, outcome, duration. View under
**Audit Log** in the app.
