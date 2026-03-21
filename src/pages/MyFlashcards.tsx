import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BookOpen, ArrowLeft, ArrowRight, Sparkles, Plus, Trash2, Pencil, CheckSquare, Merge, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { ThemeToggle } from '@/components/ThemeToggle';
import FlashcardCreator from '@/components/FlashcardCreator';

interface FlashcardGroup {
  id: string | null;
  topic_id: string;
  topic_title: string;
  step_index: number | null;
  step_title: string;
  count: number;
  created_at: string;
  custom_name: string | null;
  is_roadmap: boolean;
}

export default function MyFlashcards() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [flashcardGroups, setFlashcardGroups] = useState<FlashcardGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [renamingGroup, setRenamingGroup] = useState<FlashcardGroup | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeName, setMergeName] = useState('');
  const [merging, setMerging] = useState(false);

  const fetchGroups = async () => {
    if (!user) return;
    const { data: flashcards } = await supabase.from('flashcards').select('id, topic_id, step_index, created_at, group_id').eq('user_id', user.id).order('created_at', { ascending: false });
    if (!flashcards || flashcards.length === 0) { setFlashcardGroups([]); setLoading(false); return; }
    const topicIds = [...new Set(flashcards.map(f => f.topic_id))];
    const [{ data: topicData }, { data: roadmapData }, { data: groupData }] = await Promise.all([
      supabase.from('topics').select('id, title').in('id', topicIds),
      supabase.from('roadmaps').select('topic_id, steps').in('topic_id', topicIds),
      supabase.from('flashcard_groups').select('*').eq('user_id', user.id),
    ]);
    const topicMap: Record<string, string> = {};
    topicData?.forEach(t => { topicMap[t.id] = t.title; });
    const stepsMap: Record<string, any[]> = {};
    roadmapData?.forEach(r => { stepsMap[r.topic_id] = r.steps as any[]; });
    const groupMap: Record<string, { id: string; name: string }> = {};
    groupData?.forEach(g => { groupMap[g.id] = { id: g.id, name: g.name }; });

    const groups: Record<string, FlashcardGroup> = {};
    flashcards.forEach(fc => {
      const key = fc.group_id || `${fc.topic_id}-${fc.step_index ?? 'all'}`;
      if (!groups[key]) {
        const steps = stepsMap[fc.topic_id];
        const hasRoadmap = !!steps && steps.length > 0;
        let stepTitle = 'All Steps';
        if (fc.step_index !== null && fc.step_index !== undefined && steps?.[fc.step_index]) {
          stepTitle = steps[fc.step_index].title;
        }
        const grp = fc.group_id ? groupMap[fc.group_id] : null;
        groups[key] = {
          id: fc.group_id || null,
          topic_id: fc.topic_id,
          topic_title: topicMap[fc.topic_id] || 'Unknown',
          step_index: fc.step_index,
          step_title: stepTitle,
          count: 0,
          created_at: fc.created_at,
          custom_name: grp?.name || null,
          is_roadmap: hasRoadmap && fc.step_index !== null && fc.step_index !== undefined,
        };
      }
      groups[key].count++;
    });
    setFlashcardGroups(Object.values(groups));
    setLoading(false);
  };

  useEffect(() => { fetchGroups(); }, [user]);

  const handleDelete = async (topicId: string, stepIndex: number | null) => {
    if (!confirm('Delete these flashcards?')) return;
    let query = supabase.from('flashcards').delete().eq('topic_id', topicId);
    if (stepIndex !== null && stepIndex !== undefined) {
      query = query.eq('step_index', stepIndex);
    } else {
      query = query.is('step_index', null);
    }
    await query;
    setFlashcardGroups(prev => prev.filter(f => !(f.topic_id === topicId && f.step_index === stepIndex)));
    toast.success('Flashcards deleted');
  };

  const handleRename = async () => {
    if (!renamingGroup || !renameValue.trim() || !user) return;
    try {
      if (renamingGroup.id) {
        await supabase.from('flashcard_groups').update({ name: renameValue.trim() }).eq('id', renamingGroup.id);
      } else {
        const { data: newGroup, error } = await supabase.from('flashcard_groups').insert({
          user_id: user.id, name: renameValue.trim(), topic_id: renamingGroup.topic_id,
        }).select().single();
        if (error) throw error;
        let updateQuery = supabase.from('flashcards').update({ group_id: newGroup.id }).eq('topic_id', renamingGroup.topic_id).eq('user_id', user.id);
        if (renamingGroup.step_index !== null) {
          updateQuery = updateQuery.eq('step_index', renamingGroup.step_index);
        } else {
          updateQuery = updateQuery.is('step_index', null);
        }
        await updateQuery;
      }
      toast.success('Renamed successfully');
      setRenamingGroup(null);
      fetchGroups();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to rename');
    }
  };

  const handleMerge = async () => {
    if (selectedGroups.size < 2 || !mergeName.trim() || !user) return;
    setMerging(true);
    try {
      const groupsToMerge = flashcardGroups.filter(g => {
        const key = g.id || `${g.topic_id}-${g.step_index ?? 'all'}`;
        return selectedGroups.has(key);
      });
      const targetTopicId = groupsToMerge[0].topic_id;
      const { data: newGroup, error } = await supabase.from('flashcard_groups').insert({
        user_id: user.id, name: mergeName.trim(), topic_id: targetTopicId,
      }).select().single();
      if (error) throw error;
      for (const g of groupsToMerge) {
        if (g.id) {
          await supabase.from('flashcards').update({ group_id: newGroup.id }).eq('group_id', g.id).eq('user_id', user.id);
          await supabase.from('flashcard_groups').delete().eq('id', g.id);
        } else {
          let q = supabase.from('flashcards').update({ group_id: newGroup.id }).eq('topic_id', g.topic_id).eq('user_id', user.id).is('group_id', null);
          if (g.step_index !== null) { q = q.eq('step_index', g.step_index); } else { q = q.is('step_index', null); }
          await q;
        }
      }
      toast.success('Flashcard sets merged!');
      setMergeDialogOpen(false);
      setSelectMode(false);
      setSelectedGroups(new Set());
      setMergeName('');
      fetchGroups();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to merge');
    } finally {
      setMerging(false);
    }
  };

  const toggleGroupSelection = (group: FlashcardGroup) => {
    const key = group.id || `${group.topic_id}-${group.step_index ?? 'all'}`;
    setSelectedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const getGroupDisplayName = (group: FlashcardGroup) => {
    if (group.custom_name) return group.custom_name;
    if (group.is_roadmap) return group.step_title;
    return `${group.topic_title} — ${group.step_title}`;
  };

  const renderGroupCard = (group: FlashcardGroup, i: number) => {
    const groupKey = group.id || `${group.topic_id}-${group.step_index ?? 'all'}`;
    const isSelected = selectedGroups.has(groupKey);
    return (
      <div key={`${groupKey}-${i}`} className="flex items-center gap-2">
        {selectMode && (
          <button onClick={() => toggleGroupSelection(group)}
            className={`h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/40 hover:border-primary/60'}`}>
            {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
          </button>
        )}
        <button
          onClick={() => {
            if (selectMode) { toggleGroupSelection(group); return; }
            if (group.id) { navigate(`/flashcards/${group.topic_id}?group=${group.id}`); }
            else { navigate(`/flashcards/${group.topic_id}${group.step_index !== null ? `?step=${group.step_index}` : ''}`); }
          }}
          className={`flex-1 flex items-center justify-between p-5 rounded-2xl glass-card border transition-all text-left ${isSelected ? 'border-primary/50 shadow-[0_0_12px_-4px_hsl(var(--neon-cyan)/0.3)]' : 'border-border/50 hover:border-primary/30 card-hover'}`}>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate">{getGroupDisplayName(group)}</h3>
            <p className="text-sm text-muted-foreground">{group.count} cards</p>
          </div>
          <ArrowRight className="h-5 w-5 text-muted-foreground ml-4" />
        </button>
        {!selectMode && (
          <button onClick={() => { setRenamingGroup(group); setRenameValue(group.custom_name || `${group.topic_title} — ${group.step_title}`); }}
            className="p-2 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors shrink-0" title="Rename">
            <Pencil className="h-4 w-4" />
          </button>
        )}
        {!selectMode && (
          <button onClick={() => handleDelete(group.topic_id, group.step_index)}
            className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    );
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
                <Sparkles className="h-8 w-8 text-secondary" /> Flashcards
              </h1>
              <p className="text-muted-foreground mt-1">Create and manage your flashcard sets</p>
            </div>
          </div>

          {/* Creator */}
          <div className="mb-10">
            <FlashcardCreator />
          </div>

          {/* Saved Sets */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading font-bold text-foreground text-lg">Your Flashcard Sets</h2>
              {flashcardGroups.length > 1 && (
                <div className="flex items-center gap-2">
                  {selectMode && selectedGroups.size >= 2 && (
                    <Button size="sm" variant="glow" onClick={() => { setMergeName(''); setMergeDialogOpen(true); }}>
                      <Merge className="h-3.5 w-3.5 mr-1.5" /> Merge ({selectedGroups.size})
                    </Button>
                  )}
                  <Button size="sm" variant={selectMode ? "default" : "outline"} onClick={() => { setSelectMode(!selectMode); setSelectedGroups(new Set()); }}>
                    {selectMode ? <><X className="h-3.5 w-3.5 mr-1" /> Cancel</> : <><CheckSquare className="h-3.5 w-3.5 mr-1" /> Select</>}
                  </Button>
                </div>
              )}
            </div>
            {loading ? (
              <div className="grid gap-3">{[1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl shimmer-cyan" />)}</div>
            ) : flashcardGroups.length > 0 ? (
              <>
                {/* Regular Flashcards */}
                {flashcardGroups.filter(g => !g.is_roadmap).length > 0 && (
                  <div className="mb-6">
                    <div className="grid gap-3">
                      {flashcardGroups.filter(g => !g.is_roadmap).map((group, i) => renderGroupCard(group, i))}
                    </div>
                  </div>
                )}

                {/* Roadmap Flashcards */}
                {flashcardGroups.filter(g => g.is_roadmap).length > 0 && (
                  <div>
                    <h3 className="font-heading font-semibold text-foreground text-base mb-3 flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full gradient-primary" />
                      Roadmap Flashcards
                    </h3>
                    {(() => {
                      const roadmapGroups = flashcardGroups.filter(g => g.is_roadmap);
                      const byTopic: Record<string, FlashcardGroup[]> = {};
                      roadmapGroups.forEach(g => {
                        if (!byTopic[g.topic_id]) byTopic[g.topic_id] = [];
                        byTopic[g.topic_id].push(g);
                      });
                      return Object.entries(byTopic).map(([topicId, groups]) => (
                        <div key={topicId} className="mb-4">
                          <p className="text-sm text-muted-foreground mb-2 px-1">{groups[0].topic_title}</p>
                          <div className="grid gap-3">
                            {groups.map((group, i) => renderGroupCard(group, i))}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </>
            ) : (
              <p className="text-muted-foreground text-center py-8 glass-card rounded-2xl border border-border/50">No flashcard sets yet. Use the creator above to generate some!</p>
            )}
          </div>
        </motion.div>
      </main>

      {/* Rename Dialog */}
      <Dialog open={!!renamingGroup} onOpenChange={(open) => { if (!open) setRenamingGroup(null); }}>
        <DialogContent className="glass-card border-border/50">
          <DialogHeader><DialogTitle className="font-heading">Rename Flashcard Set</DialogTitle></DialogHeader>
          <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} placeholder="Enter new name..." className="bg-background/50" onKeyDown={(e) => e.key === 'Enter' && handleRename()} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenamingGroup(null)}>Cancel</Button>
            <Button variant="glow" onClick={handleRename} disabled={!renameValue.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge Dialog */}
      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent className="glass-card border-border/50">
          <DialogHeader><DialogTitle className="font-heading">Merge Flashcard Sets</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Merging {selectedGroups.size} sets into one. Choose a name:</p>
          <Input value={mergeName} onChange={(e) => setMergeName(e.target.value)} placeholder="Enter merged set name..." className="bg-background/50" onKeyDown={(e) => e.key === 'Enter' && handleMerge()} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeDialogOpen(false)}>Cancel</Button>
            <Button variant="glow" onClick={handleMerge} disabled={!mergeName.trim() || merging}>{merging ? 'Merging...' : 'Merge'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
