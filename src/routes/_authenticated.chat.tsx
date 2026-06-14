import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/store";
import { MODELS, AGENTS, WORKSPACES } from "@/lib/mock-data";
import { AppShell } from "@/components/layout/AppShell";
import {
  Mic,
  ArrowUp,
  ChevronDown,
  Hexagon,
  Plus,
  Globe,
  Wrench,
  ListChecks,
  Terminal,
  FileText,
  Search,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({ meta: [{ title: "Chat — Omena Codex" }] }),
  component: ChatPage,
});

const QUICK = [
  "Plan a JWT login API for an Express app",
  "Review my failing E2E test and propose a fix",
  "Refactor my checkout flow — start with a plan",
];

// Build a transport that attaches the Supabase bearer token. Recreated when
// the session changes via a key on the chat container.
function buildTransport() {
  return new DefaultChatTransport({
    api: "/api/chat",
    fetch: async (input, init) => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const headers = new Headers(init?.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return fetch(input, { ...init, headers });
    },
  });
}

function ChatPage() {
  const [transport] = useState(buildTransport);
  const { messages, sendMessage, status, error, stop } = useChat({
    transport,
    onError: (e) => console.error("[chat] error", e),
  });

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const { modelId, agentId, workspaceId, setModel } = useApp();
  const model = MODELS.find((m) => m.id === modelId)!;
  const agent = AGENTS.find((a) => a.id === agentId)!;
  const workspace = WORKSPACES.find((w) => w.id === workspaceId)!;

  // Lovable AI Gateway model id used by the backend. Keep this client-side
  // pick aligned with the model pill label for now.
  const backendModel = "google/gemini-3-flash-preview";

  const isStreaming = status === "submitted" || status === "streaming";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = Math.min(140, ta.scrollHeight) + "px";
  }, [input]);
  useEffect(() => {
    taRef.current?.focus();
  }, []);

  async function handleSend(text?: string) {
    const content = (text ?? input).trim();
    if (!content || isStreaming) return;
    setInput("");
    await sendMessage({ text: content }, { body: { model: backendModel, workspaceId } });
    requestAnimationFrame(() => taRef.current?.focus());
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background overflow-x-hidden">
      <AppShell noPadding>
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 pt-3 space-y-4"
          style={{ paddingBottom: "calc(168px + env(safe-area-inset-bottom))" }}
        >
          {messages.length === 0 && (
            <div className="mt-10 mx-auto max-w-sm text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-primary/25 to-primary/5 border border-primary/40 shadow-[0_0_40px_-8px] shadow-primary/40">
                <Hexagon className="h-7 w-7 text-primary" strokeWidth={1.6} />
              </div>
              <h2 className="mt-4 text-[20px] font-semibold tracking-tight">
                How can I help you ship?
              </h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Ask the {agent.name.toLowerCase()} to plan, build, test, or debug across{" "}
                {workspace.name}.
              </p>
              <div className="mt-5 grid gap-2">
                {QUICK.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSend(q)}
                    className="rounded-xl border border-border/80 bg-card/60 px-3.5 py-2.5 text-left text-[13px] text-foreground hover:border-primary/40 transition active:scale-[0.99]"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}

          {status === "submitted" && (
            <div className="flex justify-start">
              <div className="text-[12px] text-muted-foreground inline-flex items-center gap-2">
                <span className="inline-flex gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:120ms]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:240ms]" />
                </span>
                Thinking…
              </div>
            </div>
          )}

          {error && (
            <div className="flex justify-start">
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive inline-flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5" />
                {error.message || "Something went wrong. Please try again."}
              </div>
            </div>
          )}
        </div>
      </AppShell>

      {/* Composer */}
      <div
        className="fixed left-0 right-0 z-30 bg-gradient-to-t from-background via-background/95 to-background/0"
        style={{ bottom: "calc(64px + env(safe-area-inset-bottom))" }}
      >
        <div
          className="mx-auto w-full max-w-2xl pt-6 pb-3"
          style={{
            paddingLeft: "max(12px, env(safe-area-inset-left))",
            paddingRight: "max(12px, env(safe-area-inset-right))",
          }}
        >
          <div className="mb-2 flex items-center gap-1.5 overflow-x-auto scrollbar-none text-[10.5px] font-mono whitespace-nowrap">
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/70 bg-card/60 px-2 py-0.5 text-foreground/85 max-w-[55%]">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_6px] shadow-primary/80" />
              <span className="truncate">{workspace.name}</span>
            </span>
            <span className="shrink-0 text-muted-foreground">/</span>
            <span className="shrink-0 truncate rounded-full border border-border/70 bg-card/60 px-2 py-0.5 text-foreground/85 max-w-[45%]">
              {agent.name}
            </span>
          </div>

          <div className="rounded-3xl border border-border/80 bg-card/90 backdrop-blur-md p-2 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.6)] focus-within:border-primary/50 transition-colors">
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask Omena Codex to plan, build, test, or debug…"
              rows={1}
              className="w-full resize-none bg-transparent px-2.5 pt-1.5 pb-1 text-[14.5px] leading-relaxed outline-none placeholder:text-muted-foreground/80"
            />
            <div className="flex items-center gap-0.5 pt-1 min-w-0">
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 active:scale-95 transition"
                  aria-label="Attach"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  className="hidden xs:grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 active:scale-95 transition"
                  aria-label="Tools"
                >
                  <Wrench className="h-4 w-4" />
                </button>
                <button
                  className="hidden xs:grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 active:scale-95 transition"
                  aria-label="Browse"
                >
                  <Globe className="h-4 w-4" />
                </button>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger className="ml-1 inline-flex min-w-0 max-w-[40%] items-center gap-1 rounded-lg border border-border/70 bg-secondary/40 px-2 py-1 text-[11px] text-foreground hover:border-primary/40">
                  <span className="truncate font-mono uppercase tracking-wider text-[10px] text-primary">
                    {model.label}
                  </span>
                  <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel>Model</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {MODELS.map((m) => (
                    <DropdownMenuItem key={m.id} onClick={() => setModel(m.id)}>
                      {m.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="ml-auto flex shrink-0 items-center gap-0.5 pl-1">
                <button
                  className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 active:scale-95 transition"
                  aria-label="Voice"
                >
                  <Mic className="h-4 w-4" />
                </button>
                {isStreaming ? (
                  <button
                    onClick={() => stop()}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-destructive text-destructive-foreground shadow-[0_0_18px_-2px] shadow-destructive/50 active:scale-95 transition"
                    aria-label="Stop"
                  >
                    <span className="h-3 w-3 rounded-sm bg-current" />
                  </button>
                ) : (
                  <button
                    onClick={() => handleSend()}
                    disabled={!input.trim()}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_0_18px_-2px] shadow-primary/50 hover:bg-primary/90 disabled:opacity-40 disabled:shadow-none active:scale-95 transition"
                    aria-label="Send"
                  >
                    <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  if (message.role === "user") {
    const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-[14px] leading-relaxed text-primary-foreground whitespace-pre-wrap font-medium">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] w-full text-[14px] leading-relaxed text-foreground/95">
        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-primary/90">
          <Hexagon className="h-3 w-3" /> Omena Codex
        </div>
        <div className="space-y-2">
          {message.parts.map((part, i) => (
            <PartRenderer key={i} part={part} />
          ))}
        </div>
      </div>
    </div>
  );
}

type AnyPart = UIMessage["parts"][number];

function PartRenderer({ part }: { part: AnyPart }) {
  if (part.type === "text") {
    return <div className="whitespace-pre-wrap break-words">{part.text}</div>;
  }
  if (part.type === "reasoning") {
    return (
      <details className="rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-[12.5px] text-muted-foreground">
        <summary className="cursor-pointer select-none text-foreground/80">Reasoning</summary>
        <div className="mt-1.5 whitespace-pre-wrap">
          {("text" in part ? part.text : "") as string}
        </div>
      </details>
    );
  }
  if (typeof part.type === "string" && part.type.startsWith("tool-")) {
    return <ToolCallCard part={part as ToolPart} />;
  }
  return null;
}

type ToolPart = {
  type: string;
  toolCallId?: string;
  state?: "input-streaming" | "input-available" | "output-available" | "output-error";
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

const TOOL_META: Record<string, { icon: typeof Terminal; label: string; tint: string }> = {
  "tool-plan": { icon: ListChecks, label: "Planning", tint: "text-primary" },
  "tool-run_command": { icon: Terminal, label: "Run command", tint: "text-emerald-400" },
  "tool-read_file": { icon: FileText, label: "Read file", tint: "text-sky-400" },
  "tool-write_file": { icon: FileText, label: "Write file", tint: "text-amber-400" },
  "tool-web_search": { icon: Search, label: "Web search", tint: "text-fuchsia-400" },
};

function ToolCallCard({ part }: { part: ToolPart }) {
  const meta = TOOL_META[part.type] ?? {
    icon: Wrench,
    label: part.type.replace(/^tool-/, ""),
    tint: "text-muted-foreground",
  };
  const Icon = meta.icon;
  const state = part.state ?? "input-streaming";

  const StateIcon =
    state === "output-available"
      ? CheckCircle2
      : state === "output-error"
        ? AlertCircle
        : state === "input-available"
          ? Clock
          : Loader2;
  const stateClass =
    state === "output-available"
      ? "text-emerald-400"
      : state === "output-error"
        ? "text-destructive"
        : state === "input-available"
          ? "text-amber-400"
          : "text-primary animate-spin";

  // Special-case the plan tool: render as a checklist.
  if (part.type === "tool-plan" && state === "output-available") {
    const steps = (part.input as { steps?: string[] } | undefined)?.steps ?? [];
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
        <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.12em] text-primary">
          <ListChecks className="h-3 w-3" /> Plan
        </div>
        <ol className="space-y-1 text-[13px]">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-muted-foreground tabular-nums">{i + 1}.</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  // run_command preview
  const cmd =
    part.type === "tool-run_command"
      ? (part.input as { command?: string } | undefined)?.command
      : undefined;

  const output = part.output as
    | { pending?: boolean; approvalId?: string; note?: string; mode?: string; risk?: string }
    | undefined;
  const isPending = output?.pending === true;

  return (
    <details
      className="group rounded-xl border border-border/70 bg-card/60 overflow-hidden"
      open={state !== "output-available" || isPending}
    >
      <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-[12.5px]">
        <Icon className={`h-3.5 w-3.5 ${meta.tint}`} />
        <span className="font-medium">{meta.label}</span>
        {cmd && (
          <code className="ml-1 truncate font-mono text-[11.5px] text-muted-foreground">{cmd}</code>
        )}
        {isPending && (
          <span className="ml-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md border border-amber-500/30 text-amber-400 bg-amber-500/10">
            awaiting approval
          </span>
        )}
        <StateIcon className={`ml-auto h-3.5 w-3.5 ${stateClass}`} />
      </summary>
      <div className="border-t border-border/50 px-3 py-2 text-[11.5px] font-mono space-y-1.5">
        {isPending && (
          <a
            href="/approvals"
            className="block rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[12px] text-amber-300 font-sans"
          >
            {output?.note ?? "Awaiting approval."}{" "}
            <span className="underline">Open approvals →</span>
          </a>
        )}
        {part.input !== undefined && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
              Input
            </div>
            <pre className="whitespace-pre-wrap break-words text-foreground/85">
              {safeStringify(part.input)}
            </pre>
          </div>
        )}
        {part.output !== undefined && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
              Result
            </div>
            <pre className="whitespace-pre-wrap break-words text-foreground/85">
              {safeStringify(part.output)}
            </pre>
          </div>
        )}
        {part.errorText && <div className="text-destructive">{part.errorText}</div>}
      </div>
    </details>
  );
}

function safeStringify(v: unknown) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
