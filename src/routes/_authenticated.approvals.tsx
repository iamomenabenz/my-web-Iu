import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/AppShell";
import { listApprovals, resolveApproval } from "@/lib/approvals.functions";
import { ShieldCheck, ShieldAlert, ShieldX, Check, X, Clock, ChevronLeft } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/approvals")({
  head: () => ({ meta: [{ title: "Approvals — Omena Codex" }] }),
  component: ApprovalsPage,
});

type Tab = "pending" | "resolved";

function ApprovalsPage() {
  const [tab, setTab] = useState<Tab>("pending");
  const fetchApprovals = useServerFn(listApprovals);
  const resolveFn = useServerFn(resolveApproval);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["approvals", tab],
    queryFn: () => fetchApprovals({ data: { status: tab } }),
    refetchInterval: tab === "pending" ? 5000 : false,
  });

  const decide = useMutation({
    mutationFn: (vars: { id: string; decision: "approved" | "denied" }) =>
      resolveFn({ data: vars }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approvals"] }),
  });

  const approvals = data?.approvals ?? [];

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
          <h1 className="text-[22px] font-semibold tracking-tight leading-tight">Approvals</h1>
          <p className="text-[12px] text-muted-foreground">
            Review restricted & dangerous agent actions.
          </p>
        </div>
      </div>

      <div className="mt-4 inline-flex rounded-xl border border-border/70 bg-card/60 p-0.5 text-[12px]">
        {(["pending", "resolved"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg capitalize transition ${
              tab === t ? "bg-primary/15 text-primary" : "text-muted-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-2.5">
        {isLoading && <div className="text-[12.5px] text-muted-foreground px-1">Loading…</div>}
        {!isLoading && approvals.length === 0 && (
          <div className="rounded-2xl border border-border/70 bg-card/40 px-4 py-6 text-center">
            <ShieldCheck className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-[13px] text-muted-foreground">
              {tab === "pending" ? "No pending approvals." : "No resolved approvals yet."}
            </p>
          </div>
        )}
        {approvals.map((a) => (
          <ApprovalCard
            key={a.id}
            approval={a}
            onDecide={(decision) => decide.mutate({ id: a.id, decision })}
            pending={decide.isPending}
          />
        ))}
      </div>
    </AppShell>
  );
}

type ApprovalRow = {
  id: string;
  tool_name: string | null;
  action: string;
  risk_level: string;
  status: string;
  input_summary: string | null;
  created_at: string;
  decided_at: string | null;
};

function ApprovalCard({
  approval,
  onDecide,
  pending,
}: {
  approval: ApprovalRow;
  onDecide: (d: "approved" | "denied") => void;
  pending: boolean;
}) {
  const risk = approval.risk_level;
  const RiskIcon =
    risk === "dangerous" ? ShieldX : risk === "restricted" ? ShieldAlert : ShieldCheck;
  const riskColor =
    risk === "dangerous"
      ? "text-destructive border-destructive/40 bg-destructive/10"
      : risk === "restricted"
        ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
        : "text-primary border-primary/30 bg-primary/10";
  const statusBadge =
    approval.status === "approved"
      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
      : approval.status === "denied"
        ? "text-destructive bg-destructive/10 border-destructive/30"
        : approval.status === "expired"
          ? "text-muted-foreground bg-secondary/40 border-border/60"
          : "text-amber-400 bg-amber-500/10 border-amber-500/30";

  return (
    <div className="rounded-2xl border border-border/70 bg-card/70 p-3.5">
      <div className="flex items-start gap-2">
        <span
          className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${riskColor}`}
        >
          <RiskIcon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] text-foreground">
              {approval.tool_name ?? approval.action}
            </span>
            <span
              className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${riskColor}`}
            >
              {risk}
            </span>
            <span
              className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${statusBadge}`}
            >
              {approval.status}
            </span>
          </div>
          {approval.input_summary && (
            <pre className="mt-1.5 whitespace-pre-wrap break-words font-mono text-[11.5px] text-muted-foreground leading-snug">
              {approval.input_summary}
            </pre>
          )}
          <div className="mt-1.5 flex items-center gap-1 text-[10.5px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{new Date(approval.created_at).toLocaleString()}</span>
          </div>
        </div>
      </div>

      {approval.status === "pending" && (
        <div className="mt-3 flex gap-2">
          <button
            disabled={pending}
            onClick={() => onDecide("approved")}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary/15 text-primary border border-primary/30 px-3 py-1.5 text-[12.5px] font-medium hover:bg-primary/25 transition disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" /> Approve
          </button>
          <button
            disabled={pending}
            onClick={() => onDecide("denied")}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-destructive/10 text-destructive border border-destructive/30 px-3 py-1.5 text-[12.5px] font-medium hover:bg-destructive/20 transition disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" /> Reject
          </button>
        </div>
      )}
    </div>
  );
}
