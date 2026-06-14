import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getTerminalLogs, getTasks } from "@/lib/api";
import { useServerFn } from "@tanstack/react-start";
import { runTerminalCommand, listTerminalExecutions } from "@/lib/terminal.functions";
import { useApp } from "@/lib/store";
import { openLogStream, type StreamState } from "@/lib/stream";
import type { TerminalLine } from "@/lib/mock-data";
import { AppShell } from "@/components/layout/AppShell";
import { Copy, Trash2, ChevronDown, Circle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/terminal")({
  head: () => ({ meta: [{ title: "Terminal — Omena Codex" }] }),
  component: TerminalPage,
});

function TerminalPage() {
  const { data: seed = [] } = useQuery({ queryKey: ["term-seed"], queryFn: getTerminalLogs });
  const runCommand = useServerFn(runTerminalCommand);
  const listExecutions = useServerFn(listTerminalExecutions);
  const qc = useQueryClient();
  const { workspaceId } = useApp();
  const workspaceUuid = /^[0-9a-f-]{36}$/i.test(workspaceId) ? workspaceId : null;
  const { data: tasks = [] } = useQuery({ queryKey: ["tasks"], queryFn: getTasks });
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [taskId, setTaskId] = useState<string>("main");
  const [streamState, setStreamState] = useState<StreamState>("connecting");
  const [command, setCommand] = useState("");
  const scrollRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    setLines(seed);
  }, [seed]);
  useEffect(() => {
    const close = openLogStream({
      onLine: (l) => setLines((prev) => [...prev, l].slice(-500)),
      onState: setStreamState,
    });
    return close;
  }, []);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines]);

  const history = useQuery({
    queryKey: ["terminal-executions", workspaceUuid],
    queryFn: () => listExecutions({ data: { workspaceId: workspaceUuid } }),
    refetchInterval: 5000,
  });
  const submit = useMutation({
    mutationFn: (cmd: string) =>
      runCommand({ data: { command: cmd, workspaceId: workspaceUuid, timeoutMs: 60000 } }),
    onSuccess: (raw) => {
      const res = raw as { ok?: boolean; note?: string | null; summary?: string };
      setLines((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          stream: res.ok ? "stdout" : "system",
          text: res.note ?? res.summary ?? "Command queued.",
          ts: new Date().toISOString(),
        },
      ]);
      setCommand("");
      qc.invalidateQueries({ queryKey: ["terminal-executions"] });
    },
  });

  const currentTask = tasks.find((t) => t.id === taskId);

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:border-primary/40">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-foreground font-medium">
              {currentTask?.title ?? "Main Process"}
            </span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onClick={() => setTaskId("main")}>Main Process</DropdownMenuItem>
            {tasks.map((t) => (
              <DropdownMenuItem key={t.id} onClick={() => setTaskId(t.id)}>
                {t.title}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigator.clipboard.writeText(lines.map((l) => l.text).join("\n"))}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] hover:border-primary/40"
          >
            <Copy className="h-3 w-3" /> Copy
          </button>
          <button
            onClick={() => setLines([])}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] hover:border-destructive/40"
          >
            <Trash2 className="h-3 w-3" /> Clear
          </button>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
          <Circle className="h-2.5 w-2.5 fill-destructive text-destructive" />
          <Circle className="h-2.5 w-2.5 fill-warning text-warning" />
          <Circle className="h-2.5 w-2.5 fill-primary text-primary" />
          <span className="ml-2 text-[11px] text-muted-foreground font-mono">~ / omenacore</span>
          <span
            className={`ml-auto text-[10px] uppercase tracking-wide ${streamState === "open" ? "text-primary" : streamState === "error" ? "text-destructive" : "text-warning"}`}
          >
            {streamState}
          </span>
        </div>
        <pre
          ref={scrollRef}
          className="font-mono text-[12px] leading-relaxed p-3 h-[calc(100dvh-220px)] overflow-auto scrollbar-thin"
        >
          {lines.map((l) => (
            <span
              key={l.id}
              className={`block ${l.stream === "stderr" ? "text-destructive" : l.text.startsWith("$") ? "text-primary" : l.text.startsWith("PASS") ? "text-primary" : l.text.startsWith("FAIL") ? "text-destructive" : "text-muted-foreground"}`}
            >
              {l.text || "\u00a0"}
            </span>
          ))}
          {(history.data?.executions ?? []).slice(0, 8).map((x) => (
            <span
              key={x.id}
              className={`block ${x.status === "error" ? "text-destructive" : "text-muted-foreground"}`}
            >
              [{x.status}] {x.input_summary ?? "command"}
            </span>
          ))}
          <span className="inline-block w-2 h-3.5 bg-primary animate-pulse align-middle" />
        </pre>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const value = command.trim();
            if (value) submit.mutate(value);
          }}
          className="border-t border-border bg-background/60 px-3 py-2"
        >
          <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-card/70 px-2 py-1.5">
            <span className="font-mono text-[12px] text-primary">$</span>
            <input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="Run command via remote-agent approval flow…"
              className="min-w-0 flex-1 bg-transparent font-mono text-[12px] outline-none placeholder:text-muted-foreground"
            />
            <button
              disabled={submit.isPending}
              className="rounded-md border border-primary/30 bg-primary/15 px-2 py-1 text-[11px] text-primary disabled:opacity-50"
            >
              Run
            </button>
          </div>
          <p className="mt-1 text-[10.5px] text-muted-foreground">
            Commands never run in Lovable Cloud. Restricted commands create approvals first.
          </p>
        </form>
      </div>
    </AppShell>
  );
}
