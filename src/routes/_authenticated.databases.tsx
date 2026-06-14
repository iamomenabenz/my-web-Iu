import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import {
  listDatabases,
  upsertDatabase,
  deleteDatabase,
  testDatabase,
} from "@/lib/control-plane.functions";
import { ChevronLeft, Database, Trash2, Plus, Activity, Pencil } from "lucide-react";
import {
  Field,
  TextInput,
  Select,
  Toggle,
  StatusBadge,
  Card,
  FormShell,
} from "@/components/control-plane/Form";

export const Route = createFileRoute("/_authenticated/databases")({
  head: () => ({ meta: [{ title: "Databases — Omena Codex" }] }),
  component: DatabasesPage,
});

type DbRow = {
  id: string;
  name: string;
  db_type: string;
  secret_ref: string | null;
  enabled: boolean;
  last_validated_at: string | null;
  last_validation_status: string | null;
  last_validation_error: string | null;
};

function DatabasesPage() {
  const list = useServerFn(listDatabases);
  const upsert = useServerFn(upsertDatabase);
  const del = useServerFn(deleteDatabase);
  const test = useServerFn(testDatabase);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<DbRow> | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["databases"], queryFn: () => list() });

  const save = useMutation({
    mutationFn: (vars: {
      id?: string;
      name: string;
      db_type: "supabase" | "postgres" | "neon" | "rds" | "mysql" | "custom";
      connection_url?: string;
      secret_ref?: string | null;
      enabled: boolean;
    }) => upsert({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["databases"] });
      setEditing(null);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["databases"] }),
  });
  const probe = useMutation({
    mutationFn: (id: string) => test({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["databases"] }),
  });

  const items = (data?.databases ?? []) as DbRow[];

  return (
    <AppShell>
      <Header
        title="Databases"
        hint="Postgres / Neon / RDS / MySQL. Connection URLs stay server-side."
        onAdd={() => setEditing({})}
      />

      {editing && (
        <DbForm
          initial={editing}
          onCancel={() => setEditing(null)}
          onSubmit={(v) => save.mutate(v)}
          pending={save.isPending}
          error={save.error instanceof Error ? save.error.message : null}
        />
      )}

      <div className="mt-3 space-y-2.5">
        {isLoading && <Loading />}
        {!isLoading && items.length === 0 && !editing && (
          <Empty icon={Database} text="No databases configured." />
        )}
        {items.map((d) => (
          <Card key={d.id}>
            <div className="flex items-start gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-secondary/60">
                <Database className="h-4 w-4 text-foreground/80" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-medium">{d.name}</span>
                  <Pill>{d.db_type}</Pill>
                  <StatusBadge status={d.last_validation_status} />
                  {!d.enabled && <Pill tone="warn">disabled</Pill>}
                </div>
                {d.secret_ref && (
                  <div className="mt-0.5 text-[11px] text-muted-foreground font-mono truncate">
                    secret ref: {d.secret_ref}
                  </div>
                )}
                {d.last_validation_error && (
                  <div className="mt-0.5 text-[11px] text-amber-400/90 truncate">
                    {d.last_validation_error}
                  </div>
                )}
              </div>
            </div>
            <RowActions
              onTest={() => probe.mutate(d.id)}
              onEdit={() => setEditing(d)}
              onDelete={() => remove.mutate(d.id)}
              testing={probe.isPending}
            />
          </Card>
        ))}
      </div>
    </AppShell>
  );
}

function DbForm({
  initial,
  onCancel,
  onSubmit,
  pending,
  error,
}: {
  initial: Partial<DbRow>;
  onCancel: () => void;
  onSubmit: (v: {
    id?: string;
    name: string;
    db_type: "supabase" | "postgres" | "neon" | "rds" | "mysql" | "custom";
    connection_url?: string;
    secret_ref?: string | null;
    enabled: boolean;
  }) => void;
  pending: boolean;
  error: string | null;
}) {
  const [name, setName] = useState(initial.name ?? "");
  const [dbType, setDbType] = useState<DbRow["db_type"]>(initial.db_type ?? "postgres");
  const [url, setUrl] = useState("");
  const [secretRef, setSecretRef] = useState(initial.secret_ref ?? "");
  const [enabled, setEnabled] = useState<boolean>(initial.enabled ?? false);

  return (
    <FormShell
      onCancel={onCancel}
      pending={pending}
      error={error}
      onSubmit={() =>
        onSubmit({
          id: initial.id,
          name,
          db_type: dbType as "supabase" | "postgres" | "neon" | "rds" | "mysql" | "custom",
          connection_url: url || undefined,
          secret_ref: secretRef || null,
          enabled,
        })
      }
    >
      <Field label="Name">
        <TextInput value={name} onChange={setName} placeholder="primary-db" mono={false} />
      </Field>
      <Field label="Type">
        <Select
          value={dbType}
          onChange={(v) => setDbType(v as DbRow["db_type"])}
          options={[
            { value: "postgres", label: "postgres" },
            { value: "supabase", label: "supabase" },
            { value: "neon", label: "neon" },
            { value: "rds", label: "rds" },
            { value: "mysql", label: "mysql" },
            { value: "custom", label: "custom" },
          ]}
        />
      </Field>
      <Field
        label="Connection URL"
        hint={
          initial.id
            ? "Leave blank to keep existing URL. Write-only — never returned to the client."
            : "postgres://user:pass@host:5432/db (write-only)"
        }
      >
        <TextInput value={url} onChange={setUrl} placeholder="postgres://…" type="password" />
      </Field>
      <Field
        label="Or env secret ref"
        hint="Name of env var on the server. Used if no URL is provided."
      >
        <TextInput value={secretRef} onChange={setSecretRef} placeholder="DATABASE_URL" />
      </Field>
      <Toggle checked={enabled} onChange={setEnabled} label="Enabled" />
    </FormShell>
  );
}

/* shared bits */
export function Header({
  title,
  hint,
  onAdd,
}: {
  title: string;
  hint: string;
  onAdd?: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Link
        to="/control-plane"
        className="grid h-8 w-8 place-items-center rounded-lg bg-secondary/60 text-muted-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
      </Link>
      <div className="flex-1 min-w-0">
        <h1 className="text-[22px] font-semibold tracking-tight leading-tight">{title}</h1>
        <p className="text-[12px] text-muted-foreground">{hint}</p>
      </div>
      {onAdd && (
        <button
          onClick={onAdd}
          className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary/15 text-primary border border-primary/30 px-2.5 text-[12.5px]"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      )}
    </div>
  );
}

export function Pill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "warn" | "ok" | "info";
}) {
  const cls =
    tone === "warn"
      ? "border-amber-500/30 text-amber-400 bg-amber-500/10"
      : tone === "ok"
        ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
        : "border-border/60 text-muted-foreground";
  return (
    <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${cls}`}>
      {children}
    </span>
  );
}

export function Empty({
  icon: Icon,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/40 px-4 py-6 text-center">
      <Icon className="mx-auto h-6 w-6 text-muted-foreground" />
      <p className="mt-2 text-[13px] text-muted-foreground">{text}</p>
    </div>
  );
}

export function Loading() {
  return <div className="text-[12.5px] text-muted-foreground px-1">Loading…</div>;
}

export function RowActions({
  onTest,
  onEdit,
  onDelete,
  testing,
}: {
  onTest?: () => void;
  onEdit?: () => void;
  onDelete: () => void;
  testing?: boolean;
}) {
  return (
    <div className="mt-3 flex gap-2">
      {onTest && (
        <button
          disabled={testing}
          onClick={onTest}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-secondary/60 border border-border/60 px-3 py-1.5 text-[12.5px] disabled:opacity-50"
        >
          <Activity className="h-3.5 w-3.5" /> Test
        </button>
      )}
      {onEdit && (
        <button
          onClick={onEdit}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-secondary/60 border border-border/60 px-3 py-1.5 text-[12.5px]"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        onClick={onDelete}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-destructive/10 text-destructive border border-destructive/30 px-3 py-1.5 text-[12.5px]"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
