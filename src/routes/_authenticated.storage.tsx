import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import {
  listStorage,
  upsertStorage,
  deleteStorage,
  testStorage,
  setDefaultStorage,
} from "@/lib/control-plane.functions";
import { HardDrive, Star } from "lucide-react";
import {
  Field,
  TextInput,
  Select,
  Toggle,
  StatusBadge,
  Card,
  FormShell,
} from "@/components/control-plane/Form";
import { Header, Pill, Empty, Loading, RowActions } from "./_authenticated.databases";

export const Route = createFileRoute("/_authenticated/storage")({
  head: () => ({ meta: [{ title: "Storage — Omena Codex" }] }),
  component: StoragePage,
});

type StorageRow = {
  id: string;
  name: string;
  provider_type: string;
  bucket: string | null;
  region: string | null;
  endpoint: string | null;
  is_default: boolean;
  enabled: boolean;
  last_validation_status: string | null;
  last_validation_error: string | null;
};

type StorageProviderKind = "supabase" | "s3" | "r2" | "vercel-blob" | "local" | "custom-s3";

function StoragePage() {
  const list = useServerFn(listStorage);
  const upsert = useServerFn(upsertStorage);
  const del = useServerFn(deleteStorage);
  const test = useServerFn(testStorage);
  const setDef = useServerFn(setDefaultStorage);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<StorageRow> | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["storage"], queryFn: () => list() });

  type UpsertVars = {
    id?: string;
    name: string;
    provider_type: StorageProviderKind;
    bucket?: string | null;
    region?: string | null;
    endpoint?: string | null;
    access_key_id?: string;
    secret_access_key?: string;
    is_default: boolean;
    enabled: boolean;
  };
  const save = useMutation({
    mutationFn: (vars: UpsertVars) => upsert({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["storage"] });
      setEditing(null);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["storage"] }),
  });
  const probe = useMutation({
    mutationFn: (id: string) => test({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["storage"] }),
  });
  const makeDefault = useMutation({
    mutationFn: (id: string) => setDef({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["storage"] }),
  });

  const items = (data?.storage ?? []) as StorageRow[];

  return (
    <AppShell>
      <Header
        title="Storage"
        hint="S3 / R2 / Supabase / Vercel Blob. Secret keys stay server-side."
        onAdd={() => setEditing({})}
      />

      {editing && (
        <StorageForm
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
          <Empty icon={HardDrive} text="No storage backends." />
        )}
        {items.map((s) => (
          <Card key={s.id}>
            <div className="flex items-start gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-secondary/60">
                <HardDrive className="h-4 w-4 text-foreground/80" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-medium">{s.name}</span>
                  <Pill>{s.provider_type}</Pill>
                  <StatusBadge status={s.last_validation_status} />
                  {s.is_default && <Pill tone="ok">default</Pill>}
                  {!s.enabled && <Pill tone="warn">disabled</Pill>}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground font-mono truncate">
                  {s.bucket || "—"} {s.region ? `· ${s.region}` : ""}
                </div>
                {s.last_validation_error && (
                  <div className="mt-0.5 text-[11px] text-amber-400/90 truncate">
                    {s.last_validation_error}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                disabled={probe.isPending}
                onClick={() => probe.mutate(s.id)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-secondary/60 border border-border/60 px-3 py-1.5 text-[12.5px] disabled:opacity-50"
              >
                Test
              </button>
              {!s.is_default && (
                <button
                  onClick={() => makeDefault.mutate(s.id)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-secondary/60 border border-border/60 px-3 py-1.5 text-[12.5px]"
                >
                  <Star className="h-3.5 w-3.5" />
                </button>
              )}
              <RowActions onEdit={() => setEditing(s)} onDelete={() => remove.mutate(s.id)} />
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}

function StorageForm({
  initial,
  onCancel,
  onSubmit,
  pending,
  error,
}: {
  initial: Partial<StorageRow>;
  onCancel: () => void;
  onSubmit: (v: {
    id?: string;
    name: string;
    provider_type: StorageProviderKind;
    bucket?: string | null;
    region?: string | null;
    endpoint?: string | null;
    access_key_id?: string;
    secret_access_key?: string;
    is_default: boolean;
    enabled: boolean;
  }) => void;
  pending: boolean;
  error: string | null;
}) {
  const [name, setName] = useState(initial.name ?? "");
  const [provider, setProvider] = useState<StorageProviderKind>(
    (initial.provider_type as StorageProviderKind) ?? "s3",
  );
  const [bucket, setBucket] = useState(initial.bucket ?? "");
  const [region, setRegion] = useState(initial.region ?? "");
  const [endpoint, setEndpoint] = useState(initial.endpoint ?? "");
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [isDefault, setIsDefault] = useState(initial.is_default ?? false);
  const [enabled, setEnabled] = useState(initial.enabled ?? false);

  return (
    <FormShell
      onCancel={onCancel}
      pending={pending}
      error={error}
      onSubmit={() =>
        onSubmit({
          id: initial.id,
          name,
          provider_type: provider,
          bucket: bucket || null,
          region: region || null,
          endpoint: endpoint || null,
          access_key_id: accessKey || undefined,
          secret_access_key: secretKey || undefined,
          is_default: isDefault,
          enabled,
        })
      }
    >
      <Field label="Name">
        <TextInput value={name} onChange={setName} mono={false} placeholder="primary-storage" />
      </Field>
      <Field label="Provider">
        <Select
          value={provider}
          onChange={(v) => setProvider(v as StorageProviderKind)}
          options={[
            { value: "s3", label: "s3" },
            { value: "r2", label: "r2" },
            { value: "supabase", label: "supabase" },
            { value: "vercel-blob", label: "vercel-blob" },
            { value: "local", label: "local" },
            { value: "custom-s3", label: "custom-s3" },
          ]}
        />
      </Field>
      <Field label="Bucket">
        <TextInput value={bucket} onChange={setBucket} placeholder="my-bucket" />
      </Field>
      <Field label="Region">
        <TextInput value={region} onChange={setRegion} placeholder="auto / us-east-1" />
      </Field>
      <Field label="Endpoint" hint="Required for R2 / custom S3.">
        <TextInput
          value={endpoint}
          onChange={setEndpoint}
          placeholder="https://<account>.r2.cloudflarestorage.com"
        />
      </Field>
      <Field label="Access key ID" hint={initial.id ? "Leave blank to keep." : "Write-only."}>
        <TextInput value={accessKey} onChange={setAccessKey} type="password" />
      </Field>
      <Field label="Secret access key" hint={initial.id ? "Leave blank to keep." : "Write-only."}>
        <TextInput value={secretKey} onChange={setSecretKey} type="password" />
      </Field>
      <Toggle checked={isDefault} onChange={setIsDefault} label="Default storage" />
      <Toggle checked={enabled} onChange={setEnabled} label="Enabled" />
    </FormShell>
  );
}
