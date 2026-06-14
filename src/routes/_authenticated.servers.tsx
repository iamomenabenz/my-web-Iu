import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import {
  listServers,
  upsertServer,
  deleteServer,
  healthCheckServer,
  smokeTestServer,
} from "@/lib/servers.functions";
import {
  ChevronLeft,
  Server as ServerIcon,
  Activity,
  Trash2,
  Plus,
  Loader2,
  PlugZap,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/servers")({
  head: () => ({ meta: [{ title: "Servers — Omena Codex" }] }),
  component: ServersPage,
});

type ServerRow = {
  id: string;
  name: string;
  host: string;
  status: string;
  last_health_at: string | null;
  workspace_root: string | null;
  enabled: boolean;
  adapter_mode: string;
};

function ServersPage() {
  const fetchServers = useServerFn(listServers);
  const upsertFn = useServerFn(upsertServer);
  const deleteFn = useServerFn(deleteServer);
  const healthFn = useServerFn(healthCheckServer);
  const smokeFn = useServerFn(smokeTestServer);
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [openSmokeId, setOpenSmokeId] = useState<string | null>(null);
  const [pingResult, setPingResult] = useState<Record<string, { ok: boolean; msg: string }>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["servers"],
    queryFn: () => fetchServers(),
  });

  type UpsertInput = {
    name: string;
    host: string;
    daemon_url: string;
    daemon_token: string;
    workspace_root?: string | null;
    enabled: boolean;
    adapter_mode: "mock" | "dry-run" | "remote-agent" | "ssh" | "self-hosted-local";
  };
  const create = useMutation({
    mutationFn: (vars: UpsertInput) => upsertFn({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["servers"] });
      setShowForm(false);
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["servers"] }),
  });
  const health = useMutation({
    mutationFn: (id: string) => healthFn({ data: { id } }),
    onSuccess: (res, id) => {
      qc.invalidateQueries({ queryKey: ["servers"] });
      setPingResult((m) => ({
        ...m,
        [id]: {
          ok: res.ok,
          msg: res.ok
            ? `Connection OK${res.data?.version ? ` · daemon ${res.data.version}` : ""}`
            : (res.error ?? "Connection failed"),
        },
      }));
    },
    onError: (err, id) => {
      setPingResult((m) => ({
        ...m,
        [id]: { ok: false, msg: err instanceof Error ? err.message : "Connection failed" },
      }));
    },
  });
  type SmokeResult = Awaited<ReturnType<typeof smokeFn>>;
  const [smokeResults, setSmokeResults] = useState<Record<string, SmokeResult>>({});
  const [smokeErrors, setSmokeErrors] = useState<Record<string, string>>({});
  const smoke = useMutation({
    mutationFn: (id: string) => smokeFn({ data: { id } }),
    onSuccess: (res, id) => {
      qc.invalidateQueries({ queryKey: ["servers"] });
      setSmokeResults((m) => ({ ...m, [id]: res }));
      setSmokeErrors((m) => {
        const { [id]: _omit, ...rest } = m;
        return rest;
      });
      setOpenSmokeId(id);
    },
    onError: (err, id) => {
      setSmokeErrors((m) => ({
        ...m,
        [id]: err instanceof Error ? err.message : "Smoke test failed",
      }));
      setOpenSmokeId(id);
    },
  });

  const servers = (data?.servers ?? []) as ServerRow[];

  return (
    <AppShell>
      <div className="flex items-center gap-2">
        <Link
          to="/settings"
          className="grid h-8 w-8 place-items-center rounded-lg bg-secondary/60 text-muted-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-[22px] font-semibold tracking-tight leading-tight">Servers</h1>
          <p className="text-[12px] text-muted-foreground">
            Self-hosted agent daemons. Tokens stay server-side.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary/15 text-primary border border-primary/30 px-2.5 text-[12.5px]"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>

      {showForm && (
        <ServerForm
          onCancel={() => setShowForm(false)}
          onSubmit={(v) => create.mutate(v)}
          pending={create.isPending}
          error={create.error instanceof Error ? create.error.message : null}
        />
      )}

      <SetupHint />

      <div className="mt-3 space-y-2.5">
        {isLoading && <div className="text-[12.5px] text-muted-foreground px-1">Loading…</div>}
        {!isLoading && servers.length === 0 && (
          <div className="rounded-2xl border border-border/70 bg-card/40 px-4 py-6 text-center">
            <ServerIcon className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-[13px] text-muted-foreground">
              No servers registered. Until you connect one, the agent stays in mock/dry-run mode.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary/15 text-primary border border-primary/30 px-3 py-1.5 text-[12.5px]"
            >
              <Plus className="h-3.5 w-3.5" /> Connect a server
            </button>
          </div>
        )}
        {servers.map((s) => {
          const ping = pingResult[s.id];
          const smokeRes = smokeResults[s.id];
          const smokeErr = smokeErrors[s.id];
          const isOpen = openSmokeId === s.id;
          const ready = s.enabled && s.adapter_mode === "remote-agent";
          return (
            <div key={s.id} className="rounded-2xl border border-border/70 bg-card/70 p-3.5">
              <div className="flex items-start gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-secondary/60">
                  <ServerIcon className="h-4 w-4 text-foreground/80" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-medium">{s.name}</span>
                    <span
                      className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${
                        s.status === "online"
                          ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
                          : s.status === "offline"
                            ? "text-rose-400 bg-rose-500/10 border-rose-500/30"
                            : "text-muted-foreground bg-secondary/40 border-border/60"
                      }`}
                    >
                      {s.status}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md border border-border/60 text-muted-foreground">
                      {s.adapter_mode}
                    </span>
                    {!s.enabled && (
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md border border-amber-500/30 text-amber-400 bg-amber-500/10">
                        disabled
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-muted-foreground font-mono truncate">
                    {s.host}
                  </div>
                  {s.last_health_at && (
                    <div className="mt-0.5 text-[10.5px] text-muted-foreground">
                      Last check: {new Date(s.last_health_at).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>

              {ping && (
                <div
                  className={`mt-2.5 flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] ${
                    ping.ok
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : "border-rose-500/30 bg-rose-500/10 text-rose-300"
                  }`}
                >
                  {ping.ok ? (
                    <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  )}
                  <span className="break-words">{ping.msg}</span>
                </div>
              )}

              {!ready && (
                <div className="mt-2.5 flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[12px] text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    {!s.enabled
                      ? "Server is disabled — enable it to run live commands."
                      : `Adapter is '${s.adapter_mode}'. Switch to 'remote-agent' to talk to a daemon.`}
                  </span>
                </div>
              )}

              <div className="mt-3 flex gap-2 flex-wrap">
                <button
                  disabled={health.isPending}
                  onClick={() => health.mutate(s.id)}
                  className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-1.5 rounded-lg bg-secondary/60 border border-border/60 px-3 py-1.5 text-[12.5px] disabled:opacity-50"
                >
                  {health.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Activity className="h-3.5 w-3.5" />
                  )}
                  Test connection
                </button>
                <button
                  disabled={smoke.isPending || !ready}
                  title={
                    ready ? "Run pwd / ls / node --version" : "Enable and set remote-agent first"
                  }
                  onClick={() => smoke.mutate(s.id)}
                  className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary/15 text-primary border border-primary/30 px-3 py-1.5 text-[12.5px] disabled:opacity-40"
                >
                  {smoke.isPending && openSmokeId === s.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <PlugZap className="h-3.5 w-3.5" />
                  )}
                  Smoke test
                </button>
                <button
                  disabled={del.isPending}
                  onClick={() => {
                    if (confirm(`Delete server "${s.name}"?`)) del.mutate(s.id);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-destructive/10 text-destructive border border-destructive/30 px-3 py-1.5 text-[12.5px] disabled:opacity-50"
                  aria-label="Delete server"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {isOpen && (smokeRes || smokeErr) && (
                <SmokePanel
                  result={smokeRes}
                  error={smokeErr}
                  onClose={() => setOpenSmokeId(null)}
                />
              )}
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}

function SetupHint() {
  return (
    <div className="mt-3 rounded-2xl border border-border/70 bg-card/40 px-3 py-2.5 text-[11.5px] text-muted-foreground">
      <div className="flex items-start gap-1.5">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-foreground/70" />
        <div className="space-y-1">
          <div className="text-foreground/80 font-medium text-[12px]">Connect a remote agent</div>
          <ol className="list-decimal list-inside space-y-0.5">
            <li>
              Run the daemon from <code className="font-mono">server-agent/</code> on your VPS with{" "}
              <code className="font-mono">DAEMON_TOKEN</code> and{" "}
              <code className="font-mono">WORKSPACE_ROOT</code> set.
            </li>
            <li>Put it behind HTTPS (the URL the app will call).</li>
            <li>
              Add the server below, then run <em>Test connection</em> and <em>Smoke test</em>.
            </li>
          </ol>
          <div className="text-[11px]">
            Tokens and URLs stay server-side. Dangerous commands still require approval.
          </div>
        </div>
      </div>
    </div>
  );
}

type SmokeStep = {
  id: string;
  label: string;
  command?: string;
  ok: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
  durationMs?: number;
};

function SmokePanel({
  result,
  error,
  onClose,
}: {
  result?: { ok: boolean; steps: SmokeStep[] };
  error?: string;
  onClose: () => void;
}) {
  return (
    <div className="mt-3 rounded-xl border border-border/70 bg-background/60 p-2.5">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Smoke test
        </span>
        {result && (
          <span
            className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${
              result.ok
                ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
                : "text-rose-400 bg-rose-500/10 border-rose-500/30"
            }`}
          >
            {result.ok ? "passed" : "failed"}
          </span>
        )}
        <button
          onClick={onClose}
          className="ml-auto text-[11px] text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>
      {error && (
        <div className="flex items-start gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[12px] text-rose-300">
          <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span className="break-words">{error}</span>
        </div>
      )}
      {result?.steps?.map((step) => (
        <div
          key={step.id}
          className="mt-1.5 rounded-lg border border-border/60 bg-card/40 px-2.5 py-1.5"
        >
          <div className="flex items-center gap-1.5 text-[12px]">
            {step.ok ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <XCircle className="h-3.5 w-3.5 text-rose-400" />
            )}
            <span className="font-medium">{step.label}</span>
            {step.command && (
              <code className="font-mono text-[11px] text-muted-foreground truncate">
                {step.command}
              </code>
            )}
            {typeof step.exitCode === "number" && (
              <span className="ml-auto text-[10.5px] text-muted-foreground">
                exit {step.exitCode}
              </span>
            )}
          </div>
          {step.error && (
            <div className="mt-1 text-[11.5px] text-rose-300 break-words">{step.error}</div>
          )}
          {step.stdout && (
            <pre className="mt-1 max-h-32 overflow-auto rounded bg-background/60 px-2 py-1 text-[11px] font-mono whitespace-pre-wrap">
              {step.stdout.trim()}
            </pre>
          )}
          {step.stderr && step.stderr.trim() && (
            <pre className="mt-1 max-h-24 overflow-auto rounded bg-rose-500/10 text-rose-300 px-2 py-1 text-[11px] font-mono whitespace-pre-wrap">
              {step.stderr.trim()}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}

function ServerForm({
  onCancel,
  onSubmit,
  pending,
  error,
}: {
  onCancel: () => void;
  onSubmit: (v: {
    name: string;
    host: string;
    daemon_url: string;
    daemon_token: string;
    workspace_root?: string | null;
    enabled: boolean;
    adapter_mode: "mock" | "dry-run" | "remote-agent" | "ssh" | "self-hosted-local";
  }) => void;
  pending: boolean;
  error: string | null;
}) {
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [root, setRoot] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<
    "mock" | "dry-run" | "remote-agent" | "ssh" | "self-hosted-local"
  >("remote-agent");

  return (
    <div className="mt-4 rounded-2xl border border-border/70 bg-card/70 p-3.5 space-y-2.5">
      <Input label="Name" value={name} onChange={setName} placeholder="prod-1" />
      <Input label="Host" value={host} onChange={setHost} placeholder="prod-1.example.com" />
      <Input
        label="Daemon URL"
        value={url}
        onChange={setUrl}
        placeholder="https://agent.example.com"
      />
      <Input
        label="Daemon token"
        value={token}
        onChange={setToken}
        placeholder="secret"
        type="password"
      />
      <Input
        label="Workspace root"
        value={root}
        onChange={setRoot}
        placeholder="/var/workspaces/app"
      />

      <div>
        <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Adapter
        </label>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as typeof mode)}
          className="mt-1 w-full rounded-lg bg-background/60 border border-border/60 px-2.5 py-1.5 text-[13px]"
        >
          <option value="mock">mock</option>
          <option value="dry-run">dry-run</option>
          <option value="remote-agent">remote-agent</option>
          <option value="ssh">ssh (not yet implemented)</option>
          <option value="self-hosted-local">self-hosted-local (requires explicit enable)</option>
        </select>
      </div>

      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Enabled
      </label>

      {error && <p className="text-[12px] text-destructive">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          disabled={pending}
          onClick={() =>
            onSubmit({
              name,
              host,
              daemon_url: url,
              daemon_token: token,
              workspace_root: root || null,
              enabled,
              adapter_mode: mode,
            })
          }
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary/15 text-primary border border-primary/30 px-3 py-2 text-[13px] font-medium disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save
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

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg bg-background/60 border border-border/60 px-2.5 py-1.5 text-[13px] font-mono"
      />
    </div>
  );
}
