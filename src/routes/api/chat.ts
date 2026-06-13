// Streaming chat endpoint. Auth is enforced via Supabase bearer token.
// Persists messages to the `messages` table on stream completion.
// M3: tool execution flows through src/lib/tools/executor.server.ts which
// classifies risk and queues approvals for restricted/dangerous actions.
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, stepCountIs, tool, type UIMessage } from "ai";
import { z } from "zod";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { executeTool, type AdapterMode } from "@/lib/tools/executor.server";

const SYSTEM_PROMPT = `You are Omena Codex, a private AI DevOps engineer embedded in the user's workspace.

You collaborate by showing your full workflow — not just final answers. When given a non-trivial task:
1. Call the \`plan\` tool first with a short ordered list of steps you intend to take.
2. Use tools to act: \`run_command\` for shell, \`read_file\` / \`write_file\` for the workspace, \`web_search\` for external lookups.
3. After tools return, summarize what changed and what is next.

Tools that mutate the workspace (run_command, write_file) and tools that touch sensitive paths are RESTRICTED or DANGEROUS — they return { pending: true, approvalId } and pause until the user approves them from the Approvals tab. Do not retry the same call repeatedly; explain what is pending and continue with safe work.

Be concise. Use markdown. Render commands in code blocks. Never invent file contents — read first, then edit.`;

function buildTools(ctx: {
  supabase: SupabaseClient;
  userId: string;
  conversationId: string | null;
  workspaceId: string | null;
  adapterMode: AdapterMode;
}) {
  return {
    plan: tool({
      description:
        "Share an ordered plan of steps before acting. Always call this first for multi-step work.",
      inputSchema: z.object({
        steps: z.array(z.string()).min(1).max(12).describe("Ordered steps."),
      }),
      execute: async (input) => executeTool("plan", input, ctx),
    }),
    web_search: tool({
      description: "Search the web for up-to-date information.",
      inputSchema: z.object({ query: z.string().min(1).max(200) }),
      execute: async (input) => executeTool("web_search", input, ctx),
    }),
    run_command: tool({
      description:
        "Execute a shell command on the active workspace's server agent. Restricted by default; dangerous patterns auto-flagged for review.",
      inputSchema: z.object({
        command: z.string().min(1).max(2000),
        cwd: z.string().optional(),
        reason: z.string().describe("Why this command is needed."),
      }),
      execute: async (input) => executeTool("run_command", input, ctx),
    }),
    read_file: tool({
      description: "Read a file from the active workspace.",
      inputSchema: z.object({ path: z.string().min(1).max(1024) }),
      execute: async (input) => executeTool("read_file", input, ctx),
    }),
    write_file: tool({
      description: "Create or overwrite a file in the workspace. Requires approval.",
      inputSchema: z.object({
        path: z.string().min(1).max(1024),
        content: z.string().max(200_000),
        reason: z.string(),
      }),
      execute: async (input) => executeTool("write_file", input, ctx),
    }),
  };
}

type ReqBody = {
  messages: UIMessage[];
  conversationId?: string | null;
  model?: string;
  workspaceId?: string | null;
};

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authz = request.headers.get("authorization") ?? "";
        const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
        if (!token) return new Response("Unauthorized", { status: 401 });

        const supabaseUrl = process.env.SUPABASE_URL!;
        const supabasePublishable = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const supabase = createClient(supabaseUrl, supabasePublishable, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: userRes, error: userErr } = await supabase.auth.getUser();
        if (userErr || !userRes.user) return new Response("Unauthorized", { status: 401 });
        const userId = userRes.user.id;

        const body = (await request.json()) as ReqBody;
        const messages = Array.isArray(body.messages) ? body.messages : [];
        const model = body.model || "google/gemini-3-flash-preview";
        const workspaceId = body.workspaceId ?? null;

        // Resolve adapter mode from workspace → server, default mock.
        let adapterMode: AdapterMode = "mock";
        if (workspaceId) {
          const { data: ws } = await supabase
            .from("workspaces")
            .select("server_id, servers:server_id(adapter_mode, enabled)")
            .eq("id", workspaceId)
            .maybeSingle();
          const srv = (ws as { servers?: { adapter_mode?: string; enabled?: boolean } } | null)
            ?.servers;
          if (srv?.enabled && srv?.adapter_mode) {
            adapterMode = srv.adapter_mode as AdapterMode;
          }
        }

        let conversationId = body.conversationId ?? null;
        if (!conversationId) {
          const title = extractTitle(messages) || "New conversation";
          const { data: conv, error: convErr } = await supabase
            .from("conversations")
            .insert({ user_id: userId, title, model, workspace_id: workspaceId })
            .select("id")
            .single();
          if (convErr || !conv) {
            console.error("conv create failed", convErr);
            return new Response("Failed to create conversation", { status: 500 });
          }
          conversationId = conv.id;
        }

        const last = messages[messages.length - 1];
        if (last && last.role === "user") {
          await supabase.from("messages").insert({
            conversation_id: conversationId,
            role: "user",
            parts: last.parts as unknown as object,
          });
        }

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        const gateway = createLovableAiGatewayProvider(apiKey);

        const tools = buildTools({
          supabase,
          userId,
          conversationId,
          workspaceId,
          adapterMode,
        });

        const result = streamText({
          model: gateway(model),
          system: SYSTEM_PROMPT,
          messages: await convertToModelMessages(messages),
          tools,
          stopWhen: stepCountIs(50),
          onError: ({ error }) => {
            console.error("[chat] stream error", error);
          },
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages,
          headers: {
            "x-conversation-id": conversationId ?? "",
            "x-adapter-mode": adapterMode,
          },
          onFinish: async ({ messages: finalMessages }) => {
            const newAssistant = finalMessages
              .slice(messages.length)
              .filter((m) => m.role === "assistant");
            if (newAssistant.length === 0) return;
            const rows = newAssistant.map((m) => ({
              conversation_id: conversationId,
              role: m.role,
              parts: m.parts as unknown as object,
            }));
            const { error: insErr } = await supabase.from("messages").insert(rows);
            if (insErr) console.error("[chat] persist assistant failed", insErr);
            await supabase
              .from("conversations")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", conversationId);
          },
        });
      },
    },
  },
});

function extractTitle(messages: UIMessage[]): string | null {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return null;
  const text = firstUser.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join(" ")
    .trim();
  if (!text) return null;
  return text.length > 60 ? text.slice(0, 60) + "…" : text;
}
