import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/AppShell";
import { cancelMission, getMission, pauseMission, tickMissionFn } from "@/lib/missions/functions";
import {
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldAlert,
  Clock,
  Play,
  Pause,
  XCircle,
  ListChecks,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/missions/$id")({
  head: () => ({ meta: [{ title: "Mission — Omena Codex" }] }),
  component: MissionDetailPage,
});

function MissionDetailPage() {
  const { id } = Route.useParams();
  const fetchMission = useServerFn(getMission);
  const tickFn = useServerFn(tickMissionFn);
  const pauseFn = useServerFn(pauseMission);
  const cancelFn = useServerFn(cancelMission);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["mission", id],
    queryFn: () => fetchMission({ data: { id } }),
    refetchInterval: (q) => {
      const m = q.state.data?.mission as { status?: string } | undefined;
      if (!m) return 3000;
      if (["success", "failed", "cancelled", "paused"].includes(m.status ?? "")) return false;
      return 3000;
    },
  });

  const tick = useMutation({
    mutationFn: () => tickFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mission", id] }),
  });
  const pause = useMutation({
    mutationFn: () => pauseFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mission", id] }),
  });
  const cancel = useMutation({
    mutationFn: () => cancelFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mission", id] }),
  });

  if (isLoading || !data) {
    return (
      <AppShell>
        <div className="text-[12.5px] text-muted-foreground px-1">Loading mission…</div>
      </AppShell>
    );
  }

  const mission = data.mission as {
    id: string;
    title: string;
    goal: string;
    status: string;
    model: string | null;
    permission_level: string;
    final_summary: string | null;
    error: string | null;
    created_at: string;
    finished_at: string | null;
  };
  const steps = data.steps as Array<{
    id: string;
    step_number: number;
    title: string;
    tool_name: string | null;
    status: string;
    planned_action: string | null;
    input_summary: string | null;
    output_summary: string | null;
    approval_id: string | null;
    error: string | null;
  }>;

  const running = ["pending", "planning", "running", "waiting_for_approval"].includes(
    mission.status,
  );
  const canResume = ["waiting_for_approval", "paused"].includes(mission.status);

  return (
    <AppShell>
      <div className="flex items-center gap-2">
        <Link
          to="/missions"
          className="grid h-8 w-8 place-items-center rounded-lg bg-secondary/60 text-muted-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[20px] font-semibold tracking-tight leading-tight">
            {mission.title}
          </h1>
          <p className="text-[11.5px] text-muted-foreground">
            {mission.model ?? "default model"} · {mission.permission_level} ·{" "}
            <span className="uppercase tracking-wider">{mission.status}</span>
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-border/70 bg-card/60 p-3">
        <div className="text-[11.5px] uppercase tracking-wider text-muted-foreground">Goal</div>
        <p className="mt-1 whitespace-pre-wrap text-[13px] leading-snug">{mission.goal}</p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {canResume && (
          <button
            disabled={tick.isPending}
            onClick={() => tick.mutate()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 text-primary border border-primary/30 px-3 py-1.5 text-[12.5px] font-medium disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" /> Resume
          </button>
        )}
        {running && mission.status !== "paused" && (
          <button
            disabled={pause.isPending}
            onClick={() => pause.mutate()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-secondary/40 px-3 py-1.5 text-[12.5px] font-medium"
          >
            <Pause className="h-3.5 w-3.5" /> Pause
          </button>
        )}
        {running && (
          <button
            disabled={cancel.isPending}
            onClick={() => cancel.mutate()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive px-3 py-1.5 text-[12.5px] font-medium"
          >
            <XCircle className="h-3.5 w-3.5" /> Cancel
          </button>
        )}
        {mission.status === "waiting_for_approval" && (
          <Link
            to="/approvals"
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400 px-3 py-1.5 text-[12.5px] font-medium"
          >
            <ShieldAlert className="h-3.5 w-3.5" /> Open approvals
          </Link>
        )}
      </div>

      {mission.error && (
        <div className="mt-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-[12.5px] text-destructive">
          {mission.error}
        </div>
      )}
      {mission.final_summary && (
        <div className="mt-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-[12.5px] text-emerald-200">
          {mission.final_summary}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 text-[11.5px] uppercase tracking-wider text-muted-foreground">
        <ListChecks className="h-3.5 w-3.5" /> Plan
      </div>
      <ol className="mt-2 space-y-2">
        {steps.length === 0 && (
          <li className="rounded-2xl border border-border/70 bg-card/40 px-4 py-6 text-center text-[12.5px] text-muted-foreground">
            Planner has not produced steps yet.
          </li>
        )}
        {steps.map((s) => (
          <li key={s.id} className="rounded-2xl border border-border/70 bg-card/70 p-3">
            <div className="flex items-center gap-2">
              <StepIcon status={s.status} />
              <span className="font-mono text-[11px] text-muted-foreground">#{s.step_number}</span>
              <span className="flex-1 truncate text-[13px] font-medium">{s.title}</span>
              {s.tool_name && (
                <span className="font-mono text-[10.5px] text-muted-foreground">{s.tool_name}</span>
              )}
            </div>
            {s.input_summary && (
              <pre className="mt-1.5 whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
                {s.input_summary}
              </pre>
            )}
            {s.output_summary && (
              <pre className="mt-1.5 whitespace-pre-wrap break-words font-mono text-[11px] text-foreground/80">
                {s.output_summary}
              </pre>
            )}
            {s.error && (
              <pre className="mt-1.5 whitespace-pre-wrap break-words font-mono text-[11px] text-destructive">
                {s.error}
              </pre>
            )}
          </li>
        ))}
      </ol>

      <div className="mt-4 flex items-center gap-1 text-[10.5px] text-muted-foreground">
        <Clock className="h-3 w-3" />
        <span>Started {new Date(mission.created_at).toLocaleString()}</span>
        {mission.finished_at && (
          <span className="ml-2">· Finished {new Date(mission.finished_at).toLocaleString()}</span>
        )}
      </div>
    </AppShell>
  );
}

function StepIcon({ status }: { status: string }) {
  if (status === "success") return <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />;
  if (status === "failed") return <AlertCircle className="h-4 w-4 text-destructive shrink-0" />;
  if (status === "waiting_for_approval")
    return <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0" />;
  if (status === "running")
    return <Loader2 className="h-4 w-4 text-primary shrink-0 animate-spin" />;
  if (status === "skipped") return <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />;
  return <Clock className="h-4 w-4 text-muted-foreground shrink-0" />;
}
