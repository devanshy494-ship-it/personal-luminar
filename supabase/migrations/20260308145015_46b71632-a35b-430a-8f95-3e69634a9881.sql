
-- Add step_index to flashcards for step-level organization
ALTER TABLE public.flashcards ADD COLUMN IF NOT EXISTS step_index integer;

-- Add step_index and wrong_questions to quiz_results
ALTER TABLE public.quiz_results ADD COLUMN IF NOT EXISTS step_index integer;
ALTER TABLE public.quiz_results ADD COLUMN IF NOT EXISTS wrong_questions jsonb DEFAULT '[]'::jsonb;

-- Add DELETE policy on roadmaps
CREATE POLICY "Users can delete their own roadmaps"
ON public.roadmaps FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- Add DELETE policy on quiz_results
CREATE POLICY "Users can delete their own quiz results"
ON public.quiz_results FOR DELETE TO authenticated
USING (auth.uid() = user_id);
