import type { ReactNode } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Clock } from "lucide-react";

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  mono = true,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded-lg bg-background/60 border border-border/60 px-2.5 py-1.5 text-[13px] ${mono ? "font-mono" : ""}`}
    />
  );
}

export function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg bg-background/60 border border-border/60 px-2.5 py-1.5 text-[13px]"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-[13px]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function StatusBadge({ status }: { status?: string | null }) {
  if (!status) {
    return (
      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md border border-border/60 text-muted-foreground inline-flex items-center gap-1">
        <Clock className="h-3 w-3" /> untested
      </span>
    );
  }
  const ok =
    status === "ok" || status === "online" || status === "format_ok" || status === "config_ok";
  const warn = status.startsWith("missing") || status === "untested";
  const cls = ok
    ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
    : warn
      ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
      : "text-red-400 bg-red-500/10 border-red-500/30";
  const Icon = ok ? CheckCircle2 : warn ? AlertTriangle : XCircle;
  return (
    <span
      className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md border inline-flex items-center gap-1 ${cls}`}
    >
      <Icon className="h-3 w-3" /> {status}
    </span>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-border/70 bg-card/70 p-3.5">{children}</div>;
}

export function FormShell({
  children,
  onCancel,
  onSubmit,
  pending,
  error,
}: {
  children: ReactNode;
  onCancel: () => void;
  onSubmit: () => void;
  pending: boolean;
  error?: string | null;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-border/70 bg-card/70 p-3.5 space-y-2.5">
      {children}
      {error && <p className="text-[12px] text-destructive">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button
          disabled={pending}
          onClick={onSubmit}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary/15 text-primary border border-primary/30 px-3 py-2 text-[13px] font-medium disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          onClick={onCancel}
          className="inline-flex items-center justify-center rounded-lg bg-secondary/60 border border-border/60 px-3 py-2 text-[13px]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
