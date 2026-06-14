import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/AppShell";
import { getSystemHealth, type HealthCheck } from "@/lib/health.functions";
import {
  ChevronLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  CircleSlash,
  RefreshCw,
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/health")({
  head: () => ({ meta: [{ title: "Health — Omena Codex" }] }),
  component: HealthPage,
});

function StatusIcon({ status }: { status: HealthCheck["status"] }) {
  if (status === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "warn") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  if (status === "fail") return <XCircle className="h-4 w-4 text-destructive" />;
  return <CircleSlash className="h-4 w-4 text-muted-foreground" />;
}

function HealthPage() {
  const fetchHealth = useServerFn(getSystemHealth);
  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["system-health"],
    queryFn: () => fetchHealth(),
    refetchInterval: 30_000,
  });

  return (
    <AppShell>
      <div className="px-4 pt-3 pb-6">
        <div className="flex items-center gap-2 mb-3">
          <Link
            to="/settings"
            className="grid h-8 w-8 place-items-center rounded-lg bg-secondary/60"
            aria-label="Back to settings"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-lg font-semibold">System health</h1>
          <button
            onClick={() => refetch()}
            className="ml-auto grid h-8 w-8 place-items-center rounded-lg bg-secondary/60"
            aria-label="Refresh"
          >
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </button>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Running health checks…
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {error instanceof Error ? error.message : "Health check failed"}
          </div>
        )}

        {data && (
          <>
            <div className="rounded-2xl border border-border/70 bg-card/60 overflow-hidden divide-y divide-border/60">
              {data.checks.map((c) => (
                <div key={c.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-0.5">
                    <StatusIcon status={c.status} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-medium leading-tight">{c.label}</div>
                    {c.detail && (
                      <div className="mt-0.5 text-[12px] text-muted-foreground break-words">
                        {c.detail}
                      </div>
                    )}
                  </div>
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground/80 shrink-0">
                    {c.status}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 text-[11px] text-muted-foreground/80">
              Last checked {new Date(data.at).toLocaleString()} · refreshes every 30s
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
