import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

const DEFAULT_MODELS = {
  roadmap: 'gemini-2.5-flash',
  mindmap: 'gemini-2.5-flash',
  document_analysis: 'gemini-2.5-flash',
  lesson: 'gemini-3.1-flash-lite',
  flashcard: 'gemini-3.1-flash-lite',
  quiz: 'gemini-3.1-flash-lite',
  mindmap_expansion: 'gemini-3.1-flash-lite',
  extra_materials: 'gemini-3.1-flash-lite',
  youtube_transcript: 'gemini-3.1-flash-lite',
  suggestions: 'gemini-3.1-flash-lite',
};

export function useModelPreferences() {
  const { user } = useAuth();
  const [models, setModels] = useState(DEFAULT_MODELS);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from('user_settings')
        .select('model_preferences')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data?.model_preferences) {
        setModels({ ...DEFAULT_MODELS, ...data.model_preferences });
      }
    };
    load();
  }, [user]);

  return models;
}