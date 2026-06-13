import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/AppShell";
import { listAuditLog } from "@/lib/control-plane.functions";
import { ScrollText } from "lucide-react";
import { Card } from "@/components/control-plane/Form";
import { Header, Empty, Loading } from "./_authenticated.databases";

export const Route = createFileRoute("/_authenticated/audit-log")({
  head: () => ({ meta: [{ title: "Audit log — Omena Codex" }] }),
  component: AuditLogPage,
});

type Entry = {
  id: string;
  action: string;
  target: string | null;
  payload: Record<string, unknown> | null;
  actor: string | null;
  workspace_id: string | null;
  created_at: string;
};

function AuditLogPage() {
  const list = useServerFn(listAuditLog);
  const { data, isLoading } = useQuery({ queryKey: ["audit-log"], queryFn: () => list() });
  const entries = (data?.entries ?? []) as Entry[];

  return (
    <AppShell>
      <Header
        title="Audit log"
        hint="Provider, database, storage, workspace, approval, and tool events."
      />

      <div className="mt-3 space-y-2">
        {isLoading && <Loading />}
        {!isLoading && entries.length === 0 && (
          <Empty icon={ScrollText} text="No audit entries yet." />
        )}
        {entries.map((e) => {
          const payload = e.payload ?? {};
          const status = (payload as { status?: string }).status;
          const summary = Object.entries(payload)
            .filter(([k]) => k !== "status" && k !== "error")
            .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
            .slice(0, 4)
            .join(" · ");
          return (
            <Card key={e.id}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12.5px] font-medium font-mono">{e.action}</span>
                    {status && (
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md border border-border/60 text-muted-foreground">
                        {status}
                      </span>
                    )}
                  </div>
                  {e.target && (
                    <div className="mt-0.5 text-[11px] text-muted-foreground font-mono truncate">
                      → {e.target}
                    </div>
                  )}
                  {summary && (
                    <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
                      {summary}
                    </div>
                  )}
                  <div className="mt-0.5 text-[10.5px] text-muted-foreground">
                    {new Date(e.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
