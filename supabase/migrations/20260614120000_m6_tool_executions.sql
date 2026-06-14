-- M6: durable tool/terminal execution history.
CREATE TABLE IF NOT EXISTS public.tool_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id UUID REFERENCES public.approvals(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  server_id UUID REFERENCES public.servers(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tool_name TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  adapter_mode TEXT NOT NULL DEFAULT 'mock',
  status TEXT NOT NULL DEFAULT 'pending',
  input_summary TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tool_executions_conversation_idx
  ON public.tool_executions(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tool_executions_workspace_idx
  ON public.tool_executions(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tool_executions_approval_idx
  ON public.tool_executions(approval_id);

GRANT SELECT, INSERT, UPDATE ON public.tool_executions TO authenticated;
GRANT ALL ON public.tool_executions TO service_role;
ALTER TABLE public.tool_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tool executions read own or admin" ON public.tool_executions
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id AND c.user_id = auth.uid()
  )
);

CREATE POLICY "tool executions create own" ON public.tool_executions
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "tool executions admin update" ON public.tool_executions
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
