import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import {
  listIntegrations,
  upsertIntegration,
  deleteIntegration,
  testIntegration,
} from "@/lib/control-plane.functions";
import { Plug } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/integrations")({
  head: () => ({ meta: [{ title: "API Integrations — Omena Codex" }] }),
  component: IntegrationsPage,
});

type IntegrationRow = {
  id: string;
  name: string;
  base_url: string;
  auth_type: string;
  auth_header_name: string | null;
  enabled: boolean;
  allow_agent_use: boolean;
  description: string | null;
  last_validation_status: string | null;
  last_validation_error: string | null;
};

type AuthKind = "none" | "bearer" | "api-key" | "basic" | "custom-header";

function IntegrationsPage() {
  const list = useServerFn(listIntegrations);
  const upsert = useServerFn(upsertIntegration);
  const del = useServerFn(deleteIntegration);
  const test = useServerFn(testIntegration);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<IntegrationRow> | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["integrations"], queryFn: () => list() });

  type UpsertVars = {
    id?: string;
    name: string;
    base_url: string;
    auth_type: AuthKind;
    auth_header_name?: string | null;
    auth_token?: string;
    enabled: boolean;
    allow_agent_use: boolean;
    description?: string | null;
  };
  const save = useMutation({
    mutationFn: (vars: UpsertVars) => upsert({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["integrations"] });
      setEditing(null);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations"] }),
  });
  const probe = useMutation({
    mutationFn: (id: string) => test({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations"] }),
  });

  const items = (data?.integrations ?? []) as IntegrationRow[];

  return (
    <AppShell>
      <Header
        title="API Integrations"
        hint="External HTTP APIs the agent can call. Secrets stay server-side."
        onAdd={() => setEditing({})}
      />

      {editing && (
        <IntForm
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
          <Empty icon={Plug} text="No integrations configured." />
        )}
        {items.map((i) => (
          <Card key={i.id}>
            <div className="flex items-start gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-secondary/60">
                <Plug className="h-4 w-4 text-foreground/80" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-medium">{i.name}</span>
                  <Pill>{i.auth_type}</Pill>
                  <StatusBadge status={i.last_validation_status} />
                  {i.allow_agent_use && <Pill tone="ok">agent</Pill>}
                  {!i.enabled && <Pill tone="warn">disabled</Pill>}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground font-mono truncate">
                  {i.base_url}
                </div>
                {i.description && (
                  <div className="mt-0.5 text-[11.5px] text-muted-foreground truncate">
                    {i.description}
                  </div>
                )}
                {i.last_validation_error && (
                  <div className="mt-0.5 text-[11px] text-amber-400/90 truncate">
                    {i.last_validation_error}
                  </div>
                )}
              </div>
            </div>
            <RowActions
              onTest={() => probe.mutate(i.id)}
              onEdit={() => setEditing(i)}
              onDelete={() => remove.mutate(i.id)}
              testing={probe.isPending}
            />
          </Card>
        ))}
      </div>
    </AppShell>
  );
}

function IntForm({
  initial,
  onCancel,
  onSubmit,
  pending,
  error,
}: {
  initial: Partial<IntegrationRow>;
  onCancel: () => void;
  onSubmit: (v: {
    id?: string;
    name: string;
    base_url: string;
    auth_type: AuthKind;
    auth_header_name?: string | null;
    auth_token?: string;
    enabled: boolean;
    allow_agent_use: boolean;
    description?: string | null;
  }) => void;
  pending: boolean;
  error: string | null;
}) {
  const [name, setName] = useState(initial.name ?? "");
  const [baseUrl, setBaseUrl] = useState(initial.base_url ?? "");
  const [authType, setAuthType] = useState<AuthKind>((initial.auth_type as AuthKind) ?? "none");
  const [headerName, setHeaderName] = useState(initial.auth_header_name ?? "");
  const [token, setToken] = useState("");
  const [enabled, setEnabled] = useState(initial.enabled ?? false);
  const [allowAgent, setAllowAgent] = useState(initial.allow_agent_use ?? false);
  const [description, setDescription] = useState(initial.description ?? "");

  return (
    <FormShell
      onCancel={onCancel}
      pending={pending}
      error={error}
      onSubmit={() =>
        onSubmit({
          id: initial.id,
          name,
          base_url: baseUrl,
          auth_type: authType,
          auth_header_name: headerName || null,
          auth_token: token || undefined,
          enabled,
          allow_agent_use: allowAgent,
          description: description || null,
        })
      }
    >
      <Field label="Name">
        <TextInput value={name} onChange={setName} mono={false} placeholder="github-api" />
      </Field>
      <Field label="Base URL">
        <TextInput value={baseUrl} onChange={setBaseUrl} placeholder="https://api.github.com" />
      </Field>
      <Field label="Auth type">
        <Select
          value={authType}
          onChange={(v) => setAuthType(v as AuthKind)}
          options={[
            { value: "none", label: "none" },
            { value: "bearer", label: "bearer" },
            { value: "api-key", label: "api-key" },
            { value: "basic", label: "basic" },
            { value: "custom-header", label: "custom-header" },
          ]}
        />
      </Field>
      {(authType === "api-key" || authType === "custom-header") && (
        <Field label="Header name">
          <TextInput value={headerName} onChange={setHeaderName} placeholder="X-API-Key" />
        </Field>
      )}
      {authType !== "none" && (
        <Field label="Token / key" hint={initial.id ? "Leave blank to keep." : "Write-only."}>
          <TextInput value={token} onChange={setToken} type="password" />
        </Field>
      )}
      <Field label="Description">
        <TextInput
          value={description}
          onChange={setDescription}
          mono={false}
          placeholder="What the agent can use this API for"
        />
      </Field>
      <Toggle checked={enabled} onChange={setEnabled} label="Enabled" />
      <Toggle checked={allowAgent} onChange={setAllowAgent} label="Allow agent to call this API" />
    </FormShell>
  );
}
