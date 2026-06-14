
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  goal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','planning','running','waiting_for_approval','paused','success','failed','cancelled')),
  provider TEXT,
  model TEXT,
  permission_level TEXT NOT NULL DEFAULT 'safe' CHECK (permission_level IN ('safe','restricted','dangerous')),
  final_summary TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS missions_user_idx ON public.missions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS missions_status_idx ON public.missions(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.missions TO authenticated;
GRANT ALL ON public.missions TO service_role;
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "missions select own" ON public.missions
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "missions insert own" ON public.missions
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "missions update own" ON public.missions
FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "missions delete own" ON public.missions
FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.mission_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  step_number INT NOT NULL,
  title TEXT NOT NULL,
  planned_action TEXT,
  tool_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','waiting_for_approval','success','failed','skipped')),
  input_summary TEXT,
  output_summary TEXT,
  approval_id UUID REFERENCES public.approvals(id) ON DELETE SET NULL,
  tool_execution_id UUID REFERENCES public.tool_executions(id) ON DELETE SET NULL,
  error TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  UNIQUE (mission_id, step_number)
);

CREATE INDEX IF NOT EXISTS mission_steps_mission_idx ON public.mission_steps(mission_id, step_number);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_steps TO authenticated;
GRANT ALL ON public.mission_steps TO service_role;
ALTER TABLE public.mission_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mission_steps select via mission" ON public.mission_steps
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.missions m
    WHERE m.id = mission_id AND (m.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
);

CREATE POLICY "mission_steps insert via mission" ON public.mission_steps
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.missions m
    WHERE m.id = mission_id AND m.user_id = auth.uid()
  )
);

CREATE POLICY "mission_steps update via mission" ON public.mission_steps
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.missions m
    WHERE m.id = mission_id AND (m.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.missions m
    WHERE m.id = mission_id AND (m.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
);

CREATE POLICY "mission_steps delete via mission" ON public.mission_steps
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.missions m
    WHERE m.id = mission_id AND (m.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
);

CREATE TRIGGER missions_set_updated_at
BEFORE UPDATE ON public.missions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER mission_steps_set_updated_at
BEFORE UPDATE ON public.mission_steps
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
