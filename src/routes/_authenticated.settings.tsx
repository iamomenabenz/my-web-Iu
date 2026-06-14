import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { useApp } from "@/lib/store";
import { MODELS, AGENTS, WORKSPACES } from "@/lib/mock-data";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Trash2,
  ChevronRight,
  Briefcase,
  Bot,
  Cpu,
  ShieldCheck,
  Globe,
  FileEdit,
  Bell,
  Palette,
  KeyRound,
  LogOut,
  Check,
} from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Omena Codex" }] }),
  component: SettingsPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="px-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground/90 font-medium mb-2">
        {title}
      </h2>
      <div className="rounded-2xl border border-border/70 bg-card/60 overflow-hidden divide-y divide-border/60">
        {children}
      </div>
    </section>
  );
}

function Row({
  icon: Icon,
  label,
  hint,
  right,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  right?: React.ReactNode;
  onClick?: () => void;
}) {
  const Wrap = onClick ? "button" : "div";
  return (
    <Wrap
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-secondary/40 transition-colors"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary/60 text-foreground/80">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium text-foreground leading-tight">{label}</div>
        {hint && <div className="mt-0.5 text-[11.5px] text-muted-foreground truncate">{hint}</div>}
      </div>
      <div className="shrink-0 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
        {right}
      </div>
    </Wrap>
  );
}

function SettingsPage() {
  const {
    workspaceId,
    agentId,
    modelId,
    permissions,
    setWorkspace,
    setAgent,
    setModel,
    setPermission,
  } = useApp();
  const workspace = WORKSPACES.find((w) => w.id === workspaceId)!;
  const agent = AGENTS.find((a) => a.id === agentId)!;
  const model = MODELS.find((m) => m.id === modelId)!;

  return (
    <AppShell>
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight leading-tight">Settings</h1>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          Configure workspace, agents, and permissions.
        </p>
      </div>

      <Section title="Workspace">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full">
              <Row
                icon={Briefcase}
                label="Active Workspace"
                hint={workspace.path}
                right={
                  <>
                    <span className="text-foreground">{workspace.name}</span>
                    <ChevronRight className="h-4 w-4" />
                  </>
                }
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {WORKSPACES.map((w) => (
              <DropdownMenuItem
                key={w.id}
                onClick={() => setWorkspace(w.id)}
                className="flex items-center justify-between"
              >
                <div className="flex flex-col">
                  <span className="text-sm">{w.name}</span>
                  <span className="text-[11px] text-muted-foreground font-mono">{w.path}</span>
                </div>
                {w.id === workspaceId && <Check className="h-3.5 w-3.5 text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </Section>

      <Section title="Agent">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full">
              <Row
                icon={Bot}
                label="Active Agent"
                hint={agent.role}
                right={
                  <>
                    <span className="text-foreground">{agent.name}</span>
                    <ChevronRight className="h-4 w-4" />
                  </>
                }
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {AGENTS.map((a) => (
              <DropdownMenuItem
                key={a.id}
                onClick={() => setAgent(a.id)}
                className="flex items-center justify-between"
              >
                <div className="flex flex-col">
                  <span className="text-sm">{a.name}</span>
                  <span className="text-[11px] text-muted-foreground">{a.role}</span>
                </div>
                {a.id === agentId && <Check className="h-3.5 w-3.5 text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full">
              <Row
                icon={Cpu}
                label="Model"
                hint="Used for all conversations"
                right={
                  <>
                    <span className="text-foreground">{model.label}</span>
                    <ChevronRight className="h-4 w-4" />
                  </>
                }
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {MODELS.map((m) => (
              <DropdownMenuItem
                key={m.id}
                onClick={() => setModel(m.id)}
                className="flex items-center justify-between"
              >
                <span className="text-sm">{m.label}</span>
                {m.id === modelId && <Check className="h-3.5 w-3.5 text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </Section>

      <Section title="Control plane">
        <Link to="/control-plane" className="block">
          <Row
            icon={Cpu}
            label="Control Plane"
            hint="Providers, servers, workspaces, DBs, storage, APIs"
            right={<ChevronRight className="h-4 w-4" />}
          />
        </Link>
        <Link to="/approvals" className="block">
          <Row
            icon={ShieldCheck}
            label="Approval queue"
            hint="Review pending agent actions"
            right={<ChevronRight className="h-4 w-4" />}
          />
        </Link>
        <Link to="/servers" className="block">
          <Row
            icon={Cpu}
            label="Servers"
            hint="Register self-hosted agent daemons"
            right={<ChevronRight className="h-4 w-4" />}
          />
        </Link>
        <Link to="/health" className="block">
          <Row
            icon={ShieldCheck}
            label="System health"
            hint="App, database, agents, providers"
            right={<ChevronRight className="h-4 w-4" />}
          />
        </Link>
      </Section>

      <Section title="Permissions">
        <Row
          icon={ShieldCheck}
          label="Auto-approve safe commands"
          hint="Skip confirmation for read-only ops"
          right={
            <Switch
              checked={permissions.autoApproveSafe}
              onCheckedChange={(v) => setPermission("autoApproveSafe", v)}
            />
          }
        />
        <Row
          icon={Globe}
          label="Allow network access"
          hint="curl, fetch, package installs"
          right={
            <Switch
              checked={permissions.allowNetwork}
              onCheckedChange={(v) => setPermission("allowNetwork", v)}
            />
          }
        />
        <Row
          icon={FileEdit}
          label="Allow file writes"
          hint="Agent may modify workspace files"
          right={
            <Switch
              checked={permissions.allowFileWrites}
              onCheckedChange={(v) => setPermission("allowFileWrites", v)}
            />
          }
        />
      </Section>

      <Section title="Preferences">
        <Row
          icon={Bell}
          label="Notifications"
          hint="Task completion, approvals"
          right={<ChevronRight className="h-4 w-4" />}
          onClick={() => {}}
        />
        <Row
          icon={Palette}
          label="Appearance"
          hint="Dark · System"
          right={<ChevronRight className="h-4 w-4" />}
          onClick={() => {}}
        />
        <Row
          icon={KeyRound}
          label="API Providers"
          hint="OpenAI, Anthropic, Google…"
          right={<ChevronRight className="h-4 w-4" />}
          onClick={() => {}}
        />
      </Section>

      <Section title="Danger Zone">
        <Row
          icon={Trash2}
          label="Clear Workspace"
          hint="Removes local cache & seed data"
          right={<ChevronRight className="h-4 w-4 text-destructive" />}
          onClick={() => {}}
        />
        <button
          onClick={async () => {
            const { supabase } = await import("@/integrations/supabase/client");
            await supabase.auth.signOut();
            window.location.href = "/auth";
          }}
          className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-secondary/40"
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-destructive/15 text-destructive">
            <LogOut className="h-4 w-4" />
          </span>
          <span className="text-[14px] font-medium text-destructive">Sign Out</span>
        </button>
      </Section>

      <p className="mt-6 text-center text-[10px] text-muted-foreground">
        Omena Codex v1.0 · Production Ready
      </p>
    </AppShell>
  );
}
