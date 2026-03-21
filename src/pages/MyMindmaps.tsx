import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BookOpen, ArrowLeft, ArrowRight, GitBranch, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { ThemeToggle } from '@/components/ThemeToggle';

interface MindmapItem {
  id: string;
  topic: string;
  created_at: string;
}

export default function MyMindmaps() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mindmaps, setMindmaps] = useState<MindmapItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from('mindmaps').select('id, topic, created_at').eq('user_id', user.id).order('created_at', { ascending: false })
      .then(({ data }) => { setMindmaps((data as any) || []); setLoading(false); });
  }, [user]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this mindmap?')) return;
    await supabase.from('mindmaps').delete().eq('id', id);
    setMindmaps(prev => prev.filter(m => m.id !== id));
    toast.success('Mindmap deleted');
  };

  return (
    <div className="min-h-screen bg-background aurora-bg">
      <nav className="border-b border-border/50 glass-nav sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between h-16 px-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center neon-glow-sm">
              <BookOpen className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-heading text-xl font-bold text-foreground">Luminar</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Dashboard
            </Button>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-10 max-w-3xl relative z-10">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground font-heading flex items-center gap-3">
                <GitBranch className="h-8 w-8 text-success" /> Mindmaps
              </h1>
              <p className="text-muted-foreground mt-1">Your saved visual mind maps</p>
            </div>
            <Button variant="glow" onClick={() => navigate('/learn')}>
              <Plus className="h-4 w-4 mr-2" /> New Mindmap
            </Button>
          </div>

          {loading ? (
            <div className="grid gap-3">{[1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl shimmer-cyan" />)}</div>
          ) : mindmaps.length > 0 ? (
            <div className="grid gap-3">
              {mindmaps.map(mm => (
                <div key={mm.id} className="flex items-center gap-2">
                  <button
                    onClick={() => navigate(`/mindmap/${mm.id}`)}
                    className="flex-1 flex items-center justify-between p-5 rounded-2xl glass-card border border-border/50 hover:border-success/30 card-hover transition-all text-left hover:neon-glow-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground truncate">{mm.topic}</h3>
                      <p className="text-sm text-muted-foreground">{new Date(mm.created_at).toLocaleDateString()}</p>
                    </div>
                    <ArrowRight className="h-5 w-5 text-muted-foreground ml-4" />
                  </button>
                  <button onClick={() => handleDelete(mm.id)} className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 rounded-2xl glass-card border border-border/50">
              <GitBranch className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No mindmaps yet</h3>
              <p className="text-muted-foreground mb-6">Generate your first visual mindmap</p>
              <Button variant="glow" onClick={() => navigate('/learn')}><Plus className="h-4 w-4 mr-2" /> Create Mindmap</Button>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}
