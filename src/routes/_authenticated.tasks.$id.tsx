import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getTask, getTests, getTerminalLogs } from "@/lib/api";
import type { Task } from "@/lib/mock-data";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { ArrowLeft, CheckCircle2, Circle, XCircle, MoreVertical } from "lucide-react";

export const Route = createFileRoute("/_authenticated/tasks/$id")({
  head: ({ params }) => ({ meta: [{ title: `Task ${params.id} — Omena Codex` }] }),
  loader: async ({ params }) => {
    const task = await getTask(params.id);
    if (!task) throw notFound();
    return task;
  },
  component: TaskDetail,
  notFoundComponent: () => (
    <AppShell>
      <div className="p-8 text-center text-sm text-muted-foreground">Task not found.</div>
    </AppShell>
  ),
  errorComponent: () => (
    <AppShell>
      <div className="p-8 text-center text-sm text-destructive">
        Unable to load this task. Please try again.
      </div>
    </AppShell>
  ),
});

const TABS = ["Overview", "Reasoning", "Logs", "Files", "Changes", "Tests", "Approvals"] as const;
type Tab = (typeof TABS)[number];

const PHASES = [
  { name: "Planning & Analysis", status: "done" },
  { name: "Research", status: "done" },
  { name: "Implementation", status: "active" },
  { name: "Testing", status: "pending" },
  { name: "Deployment", status: "pending" },
] as const;

function TaskDetail() {
  const task = Route.useLoaderData() as Task;
  const [tab, setTab] = useState<Tab>("Overview");
  const { data: tests } = useQuery({
    queryKey: ["tests", task.id],
    queryFn: () => getTests(task.id),
  });
  const { data: logs = [] } = useQuery({ queryKey: ["logs"], queryFn: getTerminalLogs });

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <Link
          to="/tasks"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {task.title}
        </Link>
        <button className="grid h-8 w-8 place-items-center rounded-md hover:bg-card">
          <MoreVertical className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      <div className="mt-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
          <span>Status</span>
          <span className="font-mono text-primary text-base">{task.progress}%</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <StatusBadge status={task.status} />
        </div>
        <div className="mt-3 h-1.5 w-full rounded-full bg-secondary overflow-hidden">
          <div className="h-full bg-primary glow-accent" style={{ width: `${task.progress}%` }} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 text-[11px]">
          <div>
            <div className="uppercase tracking-wide text-muted-foreground">Started</div>
            <div className="mt-0.5 text-foreground">{task.updatedAt}</div>
          </div>
          <div>
            <div className="uppercase tracking-wide text-muted-foreground">Agent</div>
            <div className="mt-0.5 text-foreground">{task.agent}</div>
          </div>
          <div>
            <div className="uppercase tracking-wide text-muted-foreground">Workspace</div>
            <div className="mt-0.5 text-foreground">{task.workspace}</div>
          </div>
        </div>
      </div>

      <div className="mt-4 -mx-1 flex gap-1 overflow-x-auto scrollbar-none px-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`shrink-0 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "Overview" && (
          <div className="space-y-2">
            {PHASES.map((p) => (
              <div
                key={p.name}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
              >
                {p.status === "done" && <CheckCircle2 className="h-4 w-4 text-primary" />}
                {p.status === "active" && (
                  <Circle className="h-4 w-4 text-primary animate-pulse" fill="currentColor" />
                )}
                {p.status === "pending" && <Circle className="h-4 w-4 text-muted-foreground" />}
                <div className="text-sm">{p.name}</div>
                <div className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                  {p.status === "active" ? "In Progress" : p.status === "done" ? "" : "Pending"}
                </div>
              </div>
            ))}
            <div className="mt-4 rounded-xl border border-border bg-card p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Summary
              </div>
              <p className="mt-2 text-sm leading-relaxed text-foreground">{task.summary}</p>
            </div>
          </div>
        )}

        {tab === "Reasoning" && (
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-sm font-medium">Agent Reasoning</div>
            <ol className="mt-3 space-y-2 text-sm text-muted-foreground list-decimal pl-5">
              <li>Use JWT for authentication</li>
              <li>Hash passwords with bcrypt</li>
              <li>Add rate limiting to prevent brute force</li>
              <li>Validate inputs to prevent attacks</li>
              <li>Write comprehensive tests</li>
            </ol>
            <p className="mt-3 text-[12px] text-muted-foreground">
              This approach ensures security, scalability, and maintainability.
            </p>
          </div>
        )}

        {tab === "Logs" && (
          <pre className="rounded-xl border border-border bg-card p-3 font-mono text-[11px] leading-relaxed text-muted-foreground max-h-[60vh] overflow-auto scrollbar-thin">
            {logs.map((l) => l.text).join("\n")}
          </pre>
        )}

        {tab === "Files" && (
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {[
              "src/controllers/authController.js",
              "src/routes/auth.js",
              "src/middleware/rateLimit.js",
              "tests/auth.test.js",
              "tests/login.test.js",
            ].map((f) => (
              <div key={f} className="flex items-center justify-between p-3 text-sm">
                <span className="font-mono text-foreground truncate">{f}</span>
                <span className="text-[10px] text-warning uppercase tracking-wide">Modified</span>
              </div>
            ))}
          </div>
        )}

        {tab === "Changes" && (
          <div className="rounded-xl border border-border bg-card p-3 font-mono text-[12px] leading-relaxed overflow-auto">
            <div className="text-muted-foreground mb-2">@@ -10,6 +10,4 @@</div>
            <div className="text-destructive">- const bcrypt = require('bcrypt');</div>
            <div className="text-primary">+ const bcrypt = require('bcryptjs');</div>
            <div className="text-muted-foreground mt-2">// New validation</div>
            <div className="text-primary">+ if (!email || !password) {"{"}</div>
            <div className="text-primary">
              + return res.status(400).json({"{"}error:'Email and password required'{"}"}
              {"}"});
            </div>
            <div className="text-primary">+ {"}"}</div>
          </div>
        )}

        {tab === "Tests" && tests && (
          <div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-border bg-card p-3 text-center">
                <div className="text-2xl font-semibold">{tests.total}</div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Total
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-3 text-center">
                <div className="text-2xl font-semibold text-primary">{tests.passed}</div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Passed
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-3 text-center">
                <div className="text-2xl font-semibold text-destructive">{tests.failed}</div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Failed
                </div>
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-border bg-card divide-y divide-border">
              {tests.suites.map((s) => (
                <div key={s.name} className="flex items-center justify-between p-3 text-sm">
                  <div className="flex items-center gap-2">
                    {s.status === "passed" ? (
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                    <span className="font-mono">{s.name}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground font-mono">{s.ms}ms</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "Approvals" && (
          <div className="rounded-xl border border-border bg-card p-4">
            <span className="inline-block rounded-md bg-destructive/15 text-destructive border border-destructive/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
              High Risk
            </span>
            <div className="mt-3 text-[11px] uppercase tracking-wide text-muted-foreground">
              Run Command
            </div>
            <div className="mt-1 font-mono text-sm">npm run deploy</div>
            <div className="mt-3 text-[11px] uppercase tracking-wide text-muted-foreground">
              Working Directory
            </div>
            <div className="mt-1 font-mono text-sm">/home/omena/omenacore</div>
            <ul className="mt-3 space-y-1.5 text-sm">
              {[
                "Build the production version",
                "Run tests",
                "Deploy to production server",
                "Restart services",
              ].map((s) => (
                <li key={s} className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[12px] text-warning">
              ⚠ This action cannot be undone
            </div>
            <div className="mt-3 grid gap-2">
              <button className="rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                Approve
              </button>
              <button className="rounded-md border border-border py-2 text-sm font-semibold hover:bg-card">
                Reject
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
