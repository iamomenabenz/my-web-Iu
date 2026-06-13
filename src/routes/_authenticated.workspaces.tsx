import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import {
  listWorkspaces,
  upsertWorkspace,
  deleteWorkspace,
  listDatabases,
  listStorage,
} from "@/lib/control-plane.functions";
import { listProviders } from "@/lib/providers.functions";
import { listServers } from "@/lib/servers.functions";
import { Briefcase } from "lucide-react";
import {
  Field,
  TextInput,
  Select,
  StatusBadge,
  Card,
  FormShell,
} from "@/components/control-plane/Form";
import { Header, Pill, Empty, Loading, RowActions } from "./_authenticated.databases";

export const Route = createFileRoute("/_authenticated/workspaces")({
  head: () => ({ meta: [{ title: "Workspaces — Omena Codex" }] }),
  component: WorkspacesPage,
});

type WorkspaceRow = {
  id: string;
  name: string;
  path: string;
  server_id: string | null;
  allowed_paths: string[] | null;
  default_branch: string | null;
  repo_url: string | null;
  file_access_policy: string;
  command_permission_level: string;
  active_provider_id: string | null;
  active_storage_id: string | null;
  active_database_id: string | null;
};

type FilePolicy = "view-only" | "safe" | "restricted" | "full";
type CmdPolicy =
  | "view-only"
  | "safe"
  | "restricted-with-approval"
  | "dangerous-blocked"
  | "dangerous-with-approval";

function WorkspacesPage() {
  const list = useServerFn(listWorkspaces);
  const upsert = useServerFn(upsertWorkspace);
  const del = useServerFn(deleteWorkspace);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<WorkspaceRow> | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["workspaces"], queryFn: () => list() });
  const providers = useQuery({ queryKey: ["providers"], queryFn: useServerFn(listProviders) });
  const servers = useQuery({ queryKey: ["servers"], queryFn: useServerFn(listServers) });
  const dbs = useQuery({ queryKey: ["databases"], queryFn: useServerFn(listDatabases) });
  const storages = useQuery({ queryKey: ["storage"], queryFn: useServerFn(listStorage) });

  type UpsertVars = {
    id?: string;
    name: string;
    path: string;
    server_id?: string | null;
    allowed_paths: string[];
    default_branch?: string | null;
    repo_url?: string | null;
    file_access_policy: FilePolicy;
    command_permission_level: CmdPolicy;
    active_provider_id?: string | null;
    active_storage_id?: string | null;
    active_database_id?: string | null;
  };
  const save = useMutation({
    mutationFn: (vars: UpsertVars) => upsert({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      setEditing(null);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaces"] }),
  });

  const items = (data?.workspaces ?? []) as WorkspaceRow[];

  return (
    <AppShell>
      <Header
        title="Workspaces"
        hint="Roots, policies, and active provider / storage / database bindings."
        onAdd={() => setEditing({})}
      />

      {editing && (
        <WsForm
          initial={editing}
          providers={(providers.data?.providers ?? []) as { id: string; name: string }[]}
          servers={(servers.data?.servers ?? []) as { id: string; name: string }[]}
          dbs={(dbs.data?.databases ?? []) as { id: string; name: string }[]}
          storages={(storages.data?.storage ?? []) as { id: string; name: string }[]}
          onCancel={() => setEditing(null)}
          onSubmit={(v) => save.mutate(v)}
          pending={save.isPending}
          error={save.error instanceof Error ? save.error.message : null}
        />
      )}

      <div className="mt-3 space-y-2.5">
        {isLoading && <Loading />}
        {!isLoading && items.length === 0 && !editing && (
          <Empty icon={Briefcase} text="No workspaces yet." />
        )}
        {items.map((w) => (
          <Card key={w.id}>
            <div className="flex items-start gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-secondary/60">
                <Briefcase className="h-4 w-4 text-foreground/80" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-medium">{w.name}</span>
                  <Pill>{w.file_access_policy}</Pill>
                  <Pill>{w.command_permission_level}</Pill>
                  <StatusBadge status={w.server_id ? "ok" : undefined} />
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground font-mono truncate">
                  {w.path}
                </div>
                {w.repo_url && (
                  <div className="mt-0.5 text-[11px] text-muted-foreground font-mono truncate">
                    {w.repo_url}
                    {w.default_branch ? ` · ${w.default_branch}` : ""}
                  </div>
                )}
                {w.allowed_paths && w.allowed_paths.length > 0 && (
                  <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
                    allowed: {w.allowed_paths.slice(0, 3).join(", ")}
                    {w.allowed_paths.length > 3 ? "…" : ""}
                  </div>
                )}
              </div>
            </div>
            <RowActions onEdit={() => setEditing(w)} onDelete={() => remove.mutate(w.id)} />
          </Card>
        ))}
      </div>
    </AppShell>
  );
}

function WsForm({
  initial,
  providers,
  servers,
  dbs,
  storages,
  onCancel,
  onSubmit,
  pending,
  error,
}: {
  initial: Partial<WorkspaceRow>;
  providers: { id: string; name: string }[];
  servers: { id: string; name: string }[];
  dbs: { id: string; name: string }[];
  storages: { id: string; name: string }[];
  onCancel: () => void;
  onSubmit: (v: {
    id?: string;
    name: string;
    path: string;
    server_id?: string | null;
    allowed_paths: string[];
    default_branch?: string | null;
    repo_url?: string | null;
    file_access_policy: FilePolicy;
    command_permission_level: CmdPolicy;
    active_provider_id?: string | null;
    active_storage_id?: string | null;
    active_database_id?: string | null;
  }) => void;
  pending: boolean;
  error: string | null;
}) {
  const [name, setName] = useState(initial.name ?? "");
  const [path, setPath] = useState(initial.path ?? "");
  const [serverId, setServerId] = useState(initial.server_id ?? "");
  const [allowedPaths, setAllowedPaths] = useState((initial.allowed_paths ?? []).join("\n"));
  const [defaultBranch, setDefaultBranch] = useState(initial.default_branch ?? "main");
  const [repoUrl, setRepoUrl] = useState(initial.repo_url ?? "");
  const [filePolicy, setFilePolicy] = useState<FilePolicy>(
    (initial.file_access_policy as FilePolicy) ?? "restricted",
  );
  const [cmdPolicy, setCmdPolicy] = useState<CmdPolicy>(
    (initial.command_permission_level as CmdPolicy) ?? "restricted-with-approval",
  );
  const [providerId, setProviderId] = useState(initial.active_provider_id ?? "");
  const [storageId, setStorageId] = useState(initial.active_storage_id ?? "");
  const [dbId, setDbId] = useState(initial.active_database_id ?? "");

  return (
    <FormShell
      onCancel={onCancel}
      pending={pending}
      error={error}
      onSubmit={() =>
        onSubmit({
          id: initial.id,
          name,
          path,
          server_id: serverId || null,
          allowed_paths: allowedPaths
            .split("\n")
            .map((p) => p.trim())
            .filter(Boolean),
          default_branch: defaultBranch || null,
          repo_url: repoUrl || null,
          file_access_policy: filePolicy,
          command_permission_level: cmdPolicy,
          active_provider_id: providerId || null,
          active_storage_id: storageId || null,
          active_database_id: dbId || null,
        })
      }
    >
      <Field label="Name">
        <TextInput value={name} onChange={setName} mono={false} placeholder="app-prod" />
      </Field>
      <Field label="Root path">
        <TextInput value={path} onChange={setPath} placeholder="/var/workspaces/app" />
      </Field>
      <Field label="Repository URL">
        <TextInput
          value={repoUrl}
          onChange={setRepoUrl}
          placeholder="https://github.com/org/repo.git"
        />
      </Field>
      <Field label="Default branch">
        <TextInput value={defaultBranch} onChange={setDefaultBranch} placeholder="main" />
      </Field>
      <Field label="Allowed paths" hint="One per line. Restricts file ops to these subpaths.">
        <textarea
          value={allowedPaths}
          onChange={(e) => setAllowedPaths(e.target.value)}
          rows={3}
          placeholder="src/&#10;public/"
          className="w-full rounded-lg bg-background/60 border border-border/60 px-2.5 py-1.5 text-[13px] font-mono"
        />
      </Field>
      <Field label="File access policy">
        <Select
          value={filePolicy}
          onChange={(v) => setFilePolicy(v as FilePolicy)}
          options={[
            { value: "view-only", label: "view-only" },
            { value: "safe", label: "safe (allowed paths only)" },
            { value: "restricted", label: "restricted (approval for writes)" },
            { value: "full", label: "full (all paths)" },
          ]}
        />
      </Field>
      <Field label="Command policy">
        <Select
          value={cmdPolicy}
          onChange={(v) => setCmdPolicy(v as CmdPolicy)}
          options={[
            { value: "view-only", label: "view-only" },
            { value: "safe", label: "safe (read-only commands)" },
            { value: "restricted-with-approval", label: "restricted with approval" },
            { value: "dangerous-blocked", label: "dangerous blocked" },
            { value: "dangerous-with-approval", label: "dangerous with approval" },
          ]}
        />
      </Field>
      <Field label="Linked server">
        <Select
          value={serverId}
          onChange={setServerId}
          options={[
            { value: "", label: "— none —" },
            ...servers.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
      </Field>
      <Field label="Active AI provider">
        <Select
          value={providerId}
          onChange={setProviderId}
          options={[
            { value: "", label: "— default —" },
            ...providers.map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
      </Field>
      <Field label="Active storage">
        <Select
          value={storageId}
          onChange={setStorageId}
          options={[
            { value: "", label: "— default —" },
            ...storages.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
      </Field>
      <Field label="Active database">
        <Select
          value={dbId}
          onChange={setDbId}
          options={[
            { value: "", label: "— none —" },
            ...dbs.map((d) => ({ value: d.id, label: d.name })),
          ]}
        />
      </Field>
    </FormShell>
  );
}
