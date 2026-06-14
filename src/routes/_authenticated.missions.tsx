import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { createMission, listMissions, startMission } from "@/lib/missions/functions";
import {
  Rocket,
  ChevronLeft,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Shield,
  ShieldAlert,
  ShieldX,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/missions")({
  head: () => ({ meta: [{ title: "Missions — Omena Codex" }] }),
  component: MissionsPage,
});

type Permission = "safe" | "restricted" | "dangerous";

function MissionsPage() {
  const fetchMissions = useServerFn(listMissions);
  const createFn = useServerFn(createMission);
  const startFn = useServerFn(startMission);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["missions"],
    queryFn: () => fetchMissions(),
    refetchInterval: 5000,
  });

  const create = useMutation({
    mutationFn: async (vars: { goal: string; permissionLevel: Permission }) => {
      const m = await createFn({ data: vars });
      await startFn({ data: { id: m.id } });
      return m;
    },
    onSuccess: () => {
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["missions"] });
    },
  });

  const missions = data?.missions ?? [];

  return (
    <AppShell>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="grid h-8 w-8 place-items-center rounded-lg bg-secondary/60 text-muted-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight leading-tight">Missions</h1>
            <p className="text-[12px] text-muted-foreground">
              Autonomous DevOps tasks with approval gates.
            </p>
          </div>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 text-primary border border-primary/30 px-3 py-1.5 text-[12.5px] font-medium"
        >
          <Plus className="h-3.5 w-3.5" /> New
        </button>
      </div>

      <div className="mt-4 space-y-2.5">
        {isLoading && <div className="text-[12.5px] text-muted-foreground px-1">Loading…</div>}
        {!isLoading && missions.length === 0 && (
          <div className="rounded-2xl border border-border/70 bg-card/40 px-4 py-8 text-center">
            <Rocket className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-[13px] text-muted-foreground">
              No missions yet. Start one to plan and execute work autonomously.
            </p>
          </div>
        )}
        {missions.map((m) => (
          <MissionRow key={m.id} mission={m} />
        ))}
      </div>

      {open && (
        <NewMissionDialog
          onClose={() => setOpen(false)}
          onSubmit={(goal, level) => create.mutate({ goal, permissionLevel: level })}
          submitting={create.isPending}
          error={create.error instanceof Error ? create.error.message : null}
        />
      )}
    </AppShell>
  );
}

type MissionListItem = {
  id: string;
  title: string;
  status: string;
  goal: string;
  permission_level: string;
  created_at: string;
};

function MissionRow({ mission }: { mission: MissionListItem }) {
  return (
    <Link
      to="/missions/$id"
      params={{ id: mission.id }}
      className="block rounded-2xl border border-border/70 bg-card/70 p-3.5 transition hover:bg-card"
    >
      <div className="flex items-center gap-2">
        <StatusIcon status={mission.status} />
        <span className="flex-1 truncate text-[14px] font-medium">{mission.title}</span>
        <PermissionBadge level={mission.permission_level} />
      </div>
      <p className="mt-1.5 line-clamp-2 text-[12.5px] text-muted-foreground leading-snug">
        {mission.goal}
      </p>
      <div className="mt-2 flex items-center gap-1 text-[10.5px] text-muted-foreground">
        <Clock className="h-3 w-3" />
        <span>{new Date(mission.created_at).toLocaleString()}</span>
        <span className="ml-auto uppercase tracking-wider">{mission.status}</span>
      </div>
    </Link>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "success") return <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />;
  if (status === "failed" || status === "cancelled")
    return <AlertCircle className="h-4 w-4 text-destructive shrink-0" />;
  if (status === "waiting_for_approval")
    return <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0" />;
  if (status === "running" || status === "planning")
    return <Loader2 className="h-4 w-4 text-primary shrink-0 animate-spin" />;
  return <Clock className="h-4 w-4 text-muted-foreground shrink-0" />;
}

function PermissionBadge({ level }: { level: string }) {
  const Icon = level === "dangerous" ? ShieldX : level === "restricted" ? ShieldAlert : Shield;
  const cls =
    level === "dangerous"
      ? "text-destructive border-destructive/40 bg-destructive/10"
      : level === "restricted"
        ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
        : "text-primary border-primary/30 bg-primary/10";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${cls}`}
    >
      <Icon className="h-3 w-3" />
      {level}
    </span>
  );
}

function NewMissionDialog({
  onClose,
  onSubmit,
  submitting,
  error,
}: {
  onClose: () => void;
  onSubmit: (goal: string, level: Permission) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [goal, setGoal] = useState("");
  const [level, setLevel] = useState<Permission>("safe");
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border/70 bg-card p-4 shadow-xl">
        <h2 className="text-[16px] font-semibold tracking-tight">New mission</h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Describe the goal. The planner will produce a stepwise plan; restricted steps pause for
          approval.
        </p>
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          rows={5}
          placeholder="e.g. Inspect package.json and list the top-level scripts."
          className="mt-3 w-full rounded-lg border border-border/70 bg-background/60 p-2.5 text-[13px] outline-none focus:border-primary/50"
        />
        <div className="mt-3">
          <div className="text-[11.5px] uppercase tracking-wider text-muted-foreground">
            Permission level
          </div>
          <div className="mt-1.5 inline-flex rounded-xl border border-border/70 bg-secondary/40 p-0.5 text-[12px]">
            {(["safe", "restricted", "dangerous"] as Permission[]).map((p) => (
              <button
                key={p}
                onClick={() => setLevel(p)}
                className={`px-3 py-1.5 rounded-lg capitalize transition ${
                  level === p ? "bg-primary/15 text-primary" : "text-muted-foreground"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {level === "safe"
              ? "Read-only and planning tools only."
              : level === "restricted"
                ? "Adds write_file, delete_file, run_command — each step still needs approval."
                : "Same tools as restricted but the planner may attempt sensitive paths. Every action still requires explicit approval."}
          </p>
        </div>
        {error && (
          <p className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[12px] text-destructive">
            {error}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-lg border border-border/70 bg-secondary/40 px-3 py-2 text-[12.5px] font-medium"
          >
            Cancel
          </button>
          <button
            disabled={submitting || goal.trim().length < 4}
            onClick={() => onSubmit(goal.trim(), level)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-[12.5px] font-medium disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Rocket className="h-3.5 w-3.5" />
            )}
            Start mission
          </button>
        </div>
      </div>
    </div>
  );
}
