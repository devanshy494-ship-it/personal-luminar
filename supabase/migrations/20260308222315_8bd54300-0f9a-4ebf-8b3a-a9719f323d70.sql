
CREATE TABLE public.mindmaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  mindmap_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mindmaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own mindmaps" ON public.mindmaps FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create mindmaps" ON public.mindmaps FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own mindmaps" ON public.mindmaps FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own mindmaps" ON public.mindmaps FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_mindmaps_updated_at BEFORE UPDATE ON public.mindmaps FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
