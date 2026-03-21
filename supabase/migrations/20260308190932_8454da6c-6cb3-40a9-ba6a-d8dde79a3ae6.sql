ALTER TABLE public.topics ADD COLUMN generation_context jsonb DEFAULT NULL;

-- Allow users to update their own topics (needed to save generation_context)
CREATE POLICY "Users can update their own topics" ON public.topics FOR UPDATE USING (auth.uid() = user_id);