import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Save, Settings2 } from 'lucide-react';
import { toast } from 'sonner';

const GEMINI_MODELS = [
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite ⚡ (Fastest)' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash 🔥 (Balanced)' },
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash 💪 (Powerful)' },
  { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite 🚀 (Newest & Efficient)' },
];

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

const FEATURE_LABELS: Record<string, string> = {
  roadmap: '🗺️ Roadmap Generation',
  mindmap: '🧠 Mindmap Generation',
  document_analysis: '📄 Document Analysis',
  lesson: '📚 Lesson Generation',
  flashcard: '🃏 Flashcard Generation',
  quiz: '❓ Quiz Generation',
  mindmap_expansion: '🔍 Mindmap Node Expansion',
  extra_materials: '📎 Extra Materials',
  youtube_transcript: '▶️ YouTube Transcript',
  suggestions: '💡 Suggestions',
};

export default function Settings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [models, setModels] = useState(DEFAULT_MODELS);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const loadSettings = async () => {
      const { data } = await supabase
        .from('user_settings')
        .select('model_preferences')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data?.model_preferences) {
        setModels({ ...DEFAULT_MODELS, ...data.model_preferences });
      }
      setLoading(false);
    };
    loadSettings();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: user.id,
          model_preferences: models,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) throw error;
      toast.success('Settings saved!');
    } catch (e: any) {
      toast.error(e.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background aurora-bg">
      <nav className="border-b border-border/50 glass-nav sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between h-16 px-4">
          <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </button>
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            <span className="font-semibold">Settings</span>
          </div>
          <Button variant="glow" size="sm" onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground mb-2">AI Model Settings</h1>
          <p className="text-muted-foreground">Choose which Gemini model to use for each feature. Faster models save quota, powerful models give better results.</p>
        </div>

        <div className="space-y-4">
          {Object.entries(FEATURE_LABELS).map(([key, label]) => (
            <div key={key} className="glass-card rounded-2xl p-5 border border-border/50">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Default: {GEMINI_MODELS.find(m => m.value === DEFAULT_MODELS[key as keyof typeof DEFAULT_MODELS])?.label}
                  </p>
                </div>
                <select
                  value={models[key as keyof typeof models]}
                  onChange={(e) => setModels(prev => ({ ...prev, [key]: e.target.value }))}
                  className="px-3 py-2 rounded-xl border border-border bg-background/50 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-[200px]"
                >
                  {GEMINI_MODELS.map(model => (
                    <option key={model.value} value={model.value}>
                      {model.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <Button variant="glow" className="w-full" onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save All Settings'}
          </Button>
        </div>
      </div>
    </div>
  );
}