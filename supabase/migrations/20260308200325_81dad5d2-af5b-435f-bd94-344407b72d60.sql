
-- Create flashcard_groups table
CREATE TABLE public.flashcard_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add group_id column to flashcards
ALTER TABLE public.flashcards ADD COLUMN group_id UUID REFERENCES public.flashcard_groups(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.flashcard_groups ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own flashcard groups"
  ON public.flashcard_groups FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create flashcard groups"
  ON public.flashcard_groups FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own flashcard groups"
  ON public.flashcard_groups FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own flashcard groups"
  ON public.flashcard_groups FOR DELETE
  USING (auth.uid() = user_id);
