import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/AppShell";
import {
  ChevronLeft,
  ChevronRight,
  Database,
  HardDrive,
  Plug,
  Briefcase,
  Cpu,
  Server,
  ShieldCheck,
  ScrollText,
} from "lucide-react";
import { listProviders } from "@/lib/providers.functions";
import { listServers } from "@/lib/servers.functions";
import { listApprovals } from "@/lib/approvals.functions";
import {
  listDatabases,
  listStorage,
  listIntegrations,
  listWorkspaces,
} from "@/lib/control-plane.functions";

export const Route = createFileRoute("/_authenticated/control-plane")({
  head: () => ({ meta: [{ title: "Control Plane — Omena Codex" }] }),
  component: ControlPlanePage,
});

function ControlPlanePage() {
  const providers = useQuery({ queryKey: ["providers"], queryFn: useServerFn(listProviders) });
  const servers = useQuery({ queryKey: ["servers"], queryFn: useServerFn(listServers) });
  const databases = useQuery({ queryKey: ["databases"], queryFn: useServerFn(listDatabases) });
  const storage = useQuery({ queryKey: ["storage"], queryFn: useServerFn(listStorage) });
  const integrations = useQuery({
    queryKey: ["integrations"],
    queryFn: useServerFn(listIntegrations),
  });
  const workspaces = useQuery({ queryKey: ["workspaces"], queryFn: useServerFn(listWorkspaces) });
  const approvalsFn = useServerFn(listApprovals);
  const approvals = useQuery({
    queryKey: ["approvals", "pending"],
    queryFn: () => approvalsFn({ data: { status: "pending" } }),
  });

  const sections: {
    icon: typeof Server;
    label: string;
    hint: string;
    to: string;
    count: number;
    tone?: "warn";
  }[] = [
    {
      icon: Cpu,
      label: "AI Providers",
      hint: "OpenAI, Anthropic, Gemini, OpenRouter, Ollama, custom",
      to: "/settings",
      count: providers.data?.providers.length ?? 0,
    },
    {
      icon: Server,
      label: "Servers",
      hint: "Remote-agent daemons, adapter modes, health",
      to: "/servers",
      count: servers.data?.servers.length ?? 0,
    },
    {
      icon: Briefcase,
      label: "Workspaces",
      hint: "Roots, allowed paths, policies, active bindings",
      to: "/workspaces",
      count: workspaces.data?.workspaces.length ?? 0,
    },
    {
      icon: Database,
      label: "Databases",
      hint: "Postgres, Neon, RDS, MySQL — secrets server-side",
      to: "/databases",
      count: databases.data?.databases.length ?? 0,
    },
    {
      icon: HardDrive,
      label: "Storage backends",
      hint: "S3, R2, Supabase, Vercel Blob, custom-S3",
      to: "/storage",
      count: storage.data?.storage.length ?? 0,
    },
    {
      icon: Plug,
      label: "API integrations",
      hint: "External APIs the agent can call",
      to: "/integrations",
      count: integrations.data?.integrations.length ?? 0,
    },
    {
      icon: ShieldCheck,
      label: "Approvals",
      hint: "Pending and resolved approval queue",
      to: "/approvals",
      count: approvals.data?.approvals?.length ?? 0,
      tone: (approvals.data?.approvals?.length ?? 0) > 0 ? ("warn" as const) : undefined,
    },
    {
      icon: ScrollText,
      label: "Audit log",
      hint: "Provider, DB, storage, workspace, approval, tool events",
      to: "/audit-log",
      count: 0,
    },
  ];

  return (
    <AppShell>
      <div className="flex items-center gap-2">
        <Link
          to="/settings"
          className="grid h-8 w-8 place-items-center rounded-lg bg-secondary/60 text-muted-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight leading-tight">Control Plane</h1>
          <p className="text-[12px] text-muted-foreground">
            Manage providers, servers, workspaces, databases, storage, integrations, approvals, and
            audit.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[12px] text-amber-300">
        M4B — full per-section CRUD with validation stubs. Dry-run/mock remains the default
        execution mode. Real DB/storage TCP probes ship with M5 remote-agent execution.
      </div>

      <div className="mt-3 space-y-2.5">
        {sections.map((s) => (
          <Link
            key={s.label}
            to={s.to}
            className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card/70 px-3.5 py-3 active:bg-secondary/40 transition-colors"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary/60">
              <s.icon className="h-4 w-4 text-foreground/80" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-medium">{s.label}</span>
                <span
                  className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${
                    s.tone === "warn"
                      ? "border-amber-500/30 text-amber-400 bg-amber-500/10"
                      : "border-border/60 text-muted-foreground"
                  }`}
                >
                  {s.count}
                </span>
              </div>
              <div className="mt-0.5 text-[11.5px] text-muted-foreground truncate">{s.hint}</div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
