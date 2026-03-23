import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BookOpen, Plus, ArrowRight, LogOut, Brain, Sparkles, Zap, Map, Trash2, GitBranch, RotateCcw, Home } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { guestStorage } from '@/lib/guestStorage';
import { toast } from 'sonner';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface RoadmapWithTopic {
  id: string;
  progress: number;
  created_at: string;
  topics: { title: string } | null;
  topic_id: string;
}

interface MindmapItem {
  id: string;
  topic: string;
  created_at: string;
}

interface FlashcardGroup {
  id: string;
  name: string;
  topic_id: string;
  created_at: string;
  topics: { title: string } | null;
  count?: number;
}

interface QuizResult {
  id: string;
  topic_id: string;
  score: number;
  total: number;
  step_index: number | null;
  wrong_questions: any[];
  completed_at: string;
  topics: { title: string } | null;
}

export default function Dashboard() {
  const { user, guestUser, signOut } = useAuth();
  const navigate = useNavigate();
  const [roadmaps, setRoadmaps] = useState<RoadmapWithTopic[]>([]);
  const [mindmaps, setMindmaps] = useState<MindmapItem[]>([]);
  const [flashcardGroups, setFlashcardGroups] = useState<FlashcardGroup[]>([]);
  const [quizResults, setQuizResults] = useState<QuizResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFirstVisit, setIsFirstVisit] = useState(true);
  const [showSignOutDialog, setShowSignOutDialog] = useState(false);

  const isGuest = !!guestUser;

  useEffect(() => {
    if (isGuest) {
      // Load from localStorage for guests
      const guestRoadmaps = guestStorage.getRoadmaps();
      const guestTopics = guestStorage.getTopics();
      const rm: RoadmapWithTopic[] = guestRoadmaps.map(r => ({
        ...r,
        topics: guestTopics.find(t => t.id === r.topic_id) ? { title: guestTopics.find(t => t.id === r.topic_id)!.title } : null,
      }));
      setRoadmaps(rm);
      setMindmaps(guestStorage.getMindmaps());
      const guestGroups = guestStorage.getFlashcardGroups();
      setFlashcardGroups(guestGroups.map(g => ({
        ...g,
        topics: guestTopics.find(t => t.id === g.topic_id) ? { title: guestTopics.find(t => t.id === g.topic_id)!.title } : null,
      })));
      const guestQuizzes = guestStorage.getQuizResults();
      setQuizResults(guestQuizzes.map(q => ({
        ...q,
        topics: guestTopics.find(t => t.id === q.topic_id) ? { title: guestTopics.find(t => t.id === q.topic_id)!.title } : null,
      })));
      setIsFirstVisit(guestRoadmaps.length === 0);
      setLoading(false);
      return;
    }

    if (!user) return;

    Promise.all([
      supabase.from('roadmaps').select('id, progress, created_at, topic_id, topics(title)').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('mindmaps').select('id, topic, created_at').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('flashcard_groups').select('id, name, topic_id, created_at, topics(title)').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('quiz_results').select('id, topic_id, score, total, step_index, wrong_questions, completed_at, topics(title)').eq('user_id', user.id).order('completed_at', { ascending: false }),
      supabase.from('flashcards').select('id, topic_id, step_index, created_at, group_id').eq('user_id', user.id).is('group_id', null),
    ]).then(async ([rm, mm, fg, qz, ungroupedFc]) => {
      setRoadmaps((rm.data as any) || []);
      setMindmaps((mm.data as any) || []);
      setQuizResults((qz.data as any) || []);
      setIsFirstVisit(!rm.data || rm.data.length === 0);

      // Merge ungrouped flashcards as synthetic groups
      const groups: FlashcardGroup[] = (fg.data as any) || [];
      const ungrouped = (ungroupedFc.data as any) || [];
      if (ungrouped.length > 0) {
        const topicMap: Record<string, { count: number; created_at: string }> = {};
        for (const fc of ungrouped) {
          const existing = topicMap[fc.topic_id];
          if (!existing) {
            topicMap[fc.topic_id] = { count: 1, created_at: fc.created_at };
          } else {
            existing.count++;
          }
        }
        const topicIds = Object.keys(topicMap).filter(id => !groups.some(g => g.topic_id === id));
        if (topicIds.length > 0) {
          const { data: topics } = await supabase.from('topics').select('id, title').in('id', topicIds);
          for (const tid of topicIds) {
            const info = topicMap[tid];
            const topic = topics?.find((t: any) => t.id === tid);
            groups.push({
              id: `ungrouped-${tid}`,
              name: topic?.title || 'Untitled',
              topic_id: tid,
              created_at: info.created_at,
              topics: topic ? { title: topic.title } : null,
              count: info.count,
            });
          }
        }
      }
      setFlashcardGroups(groups);
      setLoading(false);
    });
  }, [user, isGuest]);

  const handleDeleteRoadmap = async (roadmapId: string, topicId: string) => {
    if (!confirm('Delete this roadmap and all associated data?')) return;
    if (isGuest) {
      guestStorage.deleteTopic(topicId);
      guestStorage.deleteRoadmap(topicId);
      setRoadmaps(prev => prev.filter(r => r.id !== roadmapId));
    } else {
      await Promise.all([
        supabase.from('flashcards').delete().eq('topic_id', topicId),
        supabase.from('quiz_results').delete().eq('topic_id', topicId),
        supabase.from('roadmaps').delete().eq('id', roadmapId),
        supabase.from('topics').delete().eq('id', topicId),
      ]);
      setRoadmaps(prev => prev.filter(r => r.id !== roadmapId));
    }
    toast.success('Roadmap deleted');
  };

  const handleDeleteMindmap = async (id: string) => {
    if (!confirm('Delete this mindmap?')) return;
    if (isGuest) {
      guestStorage.deleteMindmap(id);
      setMindmaps(prev => prev.filter(m => m.id !== id));
    } else {
      await supabase.from('mindmaps').delete().eq('id', id);
      setMindmaps(prev => prev.filter(m => m.id !== id));
    }
    toast.success('Mindmap deleted');
  };

  const handleDeleteFlashcardGroup = async (id: string) => {
    if (!confirm('Delete this flashcard set and all its cards?')) return;
    if (isGuest) {
      guestStorage.deleteFlashcardGroup(id);
      setFlashcardGroups(prev => prev.filter(g => g.id !== id));
    } else if (id.startsWith('ungrouped-')) {
      const topicId = id.replace('ungrouped-', '');
      await supabase.from('flashcards').delete().eq('topic_id', topicId).is('group_id', null);
      setFlashcardGroups(prev => prev.filter(g => g.id !== id));
    } else {
      await supabase.from('flashcards').delete().eq('group_id', id);
      await supabase.from('flashcard_groups').delete().eq('id', id);
      setFlashcardGroups(prev => prev.filter(g => g.id !== id));
    }
    toast.success('Flashcard set deleted');
  };

  const handleDeleteQuiz = async (id: string) => {
    if (!confirm('Delete this quiz result?')) return;
    if (isGuest) {
      guestStorage.deleteQuizResult(id);
      setQuizResults(prev => prev.filter(q => q.id !== id));
    } else {
      await supabase.from('quiz_results').delete().eq('id', id);
      setQuizResults(prev => prev.filter(q => q.id !== id));
    }
    toast.success('Quiz result deleted');
  };

  const handleRetryWrong = (quiz: QuizResult) => {
    if (!quiz.wrong_questions || quiz.wrong_questions.length === 0) return;
    navigate(`/quiz/${quiz.topic_id}`, {
      state: { questions: quiz.wrong_questions, topicTitle: quiz.topics?.title || 'Quiz', stepIndex: quiz.step_index ?? undefined, retryMode: true },
    });
  };

  const userName = isGuest 
    ? guestUser.name 
    : user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Learner';

  const shimmer = <div className="grid gap-3">{[1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl shimmer-cyan" />)}</div>;

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
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/')}>
                  <Home className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Back to Home</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/settings')}>
                  <Settings2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Settings</TooltipContent>
            </Tooltip>
            <ThemeToggle />
            {isGuest && (
              <span className="px-2 py-1 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-semibold">
                Guest
              </span>
            )}
            <Avatar className="h-8 w-8 border border-border/50">
              {!isGuest && <AvatarImage src={user?.user_metadata?.avatar_url || user?.user_metadata?.picture} alt={userName} />}
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                {userName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <AlertDialog open={showSignOutDialog} onOpenChange={setShowSignOutDialog}>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm">
                  <LogOut className="h-4 w-4 mr-2" /> Sign Out
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Sign out of Luminar?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {isGuest
                      ? '⚠️ You are in guest mode. Signing out will permanently delete all your data including roadmaps, flashcards, and quizzes stored on this device.'
                      : 'Are you sure you want to sign out? Your progress is saved and you can sign back in anytime.'}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => { await signOut(); navigate('/auth'); }}
                    className={isGuest ? 'bg-destructive hover:bg-destructive/90' : ''}
                  >
                    {isGuest ? 'Sign Out & Delete Data' : 'Sign Out'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-10 max-w-5xl relative z-10">
        <motion.div className="mb-10" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2 font-heading">
            {isFirstVisit ? 'Welcome,' : 'Welcome back,'}{' '}
            <span className="gradient-text">{userName}</span>
          </h1>
          <p className="text-muted-foreground text-lg">{isFirstVisit ? "Let's start your learning journey." : 'Continue your learning journey.'}</p>
        </motion.div>

        {/* Quick Actions */}
        <motion.div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 mb-12" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
          <button onClick={() => navigate('/learn')} className="group p-6 rounded-2xl glass-card border border-primary/20 hover:border-primary/50 card-hover transition-all text-left hover:shadow-[0_0_24px_-6px_hsl(var(--neon-cyan)/0.3)]">
            <Brain className="h-8 w-8 text-primary mb-3" />
            <h3 className="font-heading font-bold text-foreground mb-1">New Roadmap</h3>
            <p className="text-sm text-muted-foreground">Enter a topic & get a learning path</p>
          </button>
          <button onClick={() => navigate('/my-mindmaps')} className="group p-6 rounded-2xl glass-card border border-success/20 hover:border-success/50 card-hover transition-all text-left hover:shadow-[0_0_24px_-6px_hsl(var(--success)/0.3)]">
            <GitBranch className="h-8 w-8 text-success mb-3" />
            <h3 className="font-heading font-bold text-foreground mb-1">Mindmaps</h3>
            <p className="text-sm text-muted-foreground">Visual topic exploration</p>
          </button>
          <button onClick={() => navigate('/my-flashcards')} className="group p-6 rounded-2xl glass-card border border-secondary/20 hover:border-secondary/50 card-hover transition-all text-left hover:shadow-[0_0_24px_-6px_hsl(var(--neon-purple)/0.3)]">
            <Sparkles className="h-8 w-8 text-secondary mb-3" />
            <h3 className="font-heading font-bold text-foreground mb-1">Flashcards</h3>
            <p className="text-sm text-muted-foreground">Generate from any document or URL</p>
          </button>
          <button onClick={() => navigate('/my-quizzes')} className="group p-6 rounded-2xl glass-card border border-warning/20 hover:border-warning/50 card-hover transition-all text-left hover:shadow-[0_0_24px_-6px_hsl(var(--warning)/0.3)]">
            <Zap className="h-8 w-8 text-warning mb-3" />
            <h3 className="font-heading font-bold text-foreground mb-1">Take a Quiz</h3>
            <p className="text-sm text-muted-foreground">Test your knowledge</p>
          </button>
        </motion.div>

        {/* Stats */}
        <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}>
          <div className="p-5 rounded-2xl glass-card border-t-2 border-t-primary border border-border/50 text-center">
            <Brain className="h-6 w-6 text-primary mx-auto mb-2" />
            <p className="text-2xl font-bold text-foreground">{roadmaps.length}</p>
            <p className="text-sm text-muted-foreground">Roadmaps</p>
          </div>
          <div className="p-5 rounded-2xl glass-card border-t-2 border-t-success border border-border/50 text-center">
            <GitBranch className="h-6 w-6 text-success mx-auto mb-2" />
            <p className="text-2xl font-bold text-foreground">{mindmaps.length}</p>
            <p className="text-sm text-muted-foreground">Mindmaps</p>
          </div>
          <div className="p-5 rounded-2xl glass-card border-t-2 border-t-secondary border border-border/50 text-center">
            <Sparkles className="h-6 w-6 text-secondary mx-auto mb-2" />
            <p className="text-2xl font-bold text-foreground">{flashcardGroups.length}</p>
            <p className="text-sm text-muted-foreground">Flashcard Sets</p>
          </div>
          <div className="p-5 rounded-2xl glass-card border-t-2 border-t-warning border border-border/50 text-center">
            <Zap className="h-6 w-6 text-warning mx-auto mb-2" />
            <p className="text-2xl font-bold text-foreground">{quizResults.length}</p>
            <p className="text-sm text-muted-foreground">Quizzes</p>
          </div>
        </motion.div>

        {/* Roadmaps List */}
        <motion.div className="mb-12" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
              <Map className="h-5 w-5 text-primary" /> Your Roadmaps
            </h2>
            <Button variant="outline" size="sm" onClick={() => navigate('/learn')}>
              <Plus className="h-4 w-4 mr-2" /> New Topic
            </Button>
          </div>
          {loading ? shimmer : roadmaps.length > 0 ? (
            <div className="grid gap-3">
              {roadmaps.map(roadmap => (
                <div key={roadmap.id} className="flex items-center gap-2">
                  <button onClick={() => navigate(`/roadmap/${roadmap.topic_id}`)} className="flex-1 flex items-center justify-between p-5 rounded-2xl glass-card border border-border/50 hover:border-primary/30 card-hover transition-all text-left hover:neon-glow-sm">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground truncate">{roadmap.topics?.title || 'Untitled'}</h3>
                      <p className="text-sm text-muted-foreground">{new Date(roadmap.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full gradient-primary transition-all" style={{ width: `${roadmap.progress}%` }} />
                        </div>
                        <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">{roadmap.progress}%</span>
                      </div>
                      <ArrowRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </button>
                  <button onClick={() => handleDeleteRoadmap(roadmap.id, roadmap.topic_id)} className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 rounded-2xl glass-card border border-border/50">
              <Map className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No roadmaps yet</h3>
              <p className="text-muted-foreground mb-6">Generate your first learning roadmap</p>
              <Button variant="glow" onClick={() => navigate('/learn')}><Plus className="h-4 w-4 mr-2" /> Create Roadmap</Button>
            </div>
          )}
        </motion.div>

        {/* Mindmaps List */}
        <motion.div className="mb-12" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.35 }}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-success" /> Your Mindmaps
            </h2>
            <Button variant="outline" size="sm" onClick={() => navigate('/my-mindmaps')}>
              <ArrowRight className="h-4 w-4 mr-2" /> View All
            </Button>
          </div>
          {loading ? shimmer : mindmaps.length > 0 ? (
            <div className="grid gap-3">
              {mindmaps.slice(0, 5).map(mm => (
                <div key={mm.id} className="flex items-center gap-2">
                  <button onClick={() => navigate(`/mindmap/${mm.id}`)} className="flex-1 flex items-center justify-between p-5 rounded-2xl glass-card border border-border/50 hover:border-success/30 card-hover transition-all text-left hover:neon-glow-sm">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground truncate">{mm.topic}</h3>
                      <p className="text-sm text-muted-foreground">{new Date(mm.created_at).toLocaleDateString()}</p>
                    </div>
                    <ArrowRight className="h-5 w-5 text-muted-foreground ml-4" />
                  </button>
                  <button onClick={() => handleDeleteMindmap(mm.id)} className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0">
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

        {/* Flashcard Sets List */}
        <motion.div className="mb-12" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.4 }}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-secondary" /> Your Flashcards
            </h2>
            <Button variant="outline" size="sm" onClick={() => navigate('/my-flashcards')}>
              <ArrowRight className="h-4 w-4 mr-2" /> View All
            </Button>
          </div>
          {loading ? shimmer : flashcardGroups.length > 0 ? (
            <div className="grid gap-3">
              {flashcardGroups.slice(0, 5).map(group => (
                <div key={group.id} className="flex items-center gap-2">
                  <button onClick={() => navigate('/my-flashcards')} className="flex-1 flex items-center justify-between p-5 rounded-2xl glass-card border border-border/50 hover:border-secondary/30 card-hover transition-all text-left hover:neon-glow-sm">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground truncate">{group.name}</h3>
                      <p className="text-sm text-muted-foreground">{group.topics?.title || 'Custom'} · {new Date(group.created_at).toLocaleDateString()}</p>
                    </div>
                    <ArrowRight className="h-5 w-5 text-muted-foreground ml-4" />
                  </button>
                  <button onClick={() => handleDeleteFlashcardGroup(group.id)} className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 rounded-2xl glass-card border border-border/50">
              <Sparkles className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No flashcard sets yet</h3>
              <p className="text-muted-foreground mb-6">Generate flashcards from any topic</p>
              <Button variant="glow" onClick={() => navigate('/my-flashcards')}><Plus className="h-4 w-4 mr-2" /> Create Flashcards</Button>
            </div>
          )}
        </motion.div>

        {/* Quiz Results List */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.45 }}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
              <Zap className="h-5 w-5 text-warning" /> Your Quizzes
            </h2>
            <Button variant="outline" size="sm" onClick={() => navigate('/my-quizzes')}>
              <ArrowRight className="h-4 w-4 mr-2" /> View All
            </Button>
          </div>
          {loading ? shimmer : quizResults.length > 0 ? (
            <div className="grid gap-3">
              {quizResults.slice(0, 5).map(quiz => (
                <div key={quiz.id} className="flex items-center gap-2">
                  <div className="flex-1 p-5 rounded-2xl glass-card border border-border/50">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground truncate">{quiz.topics?.title || 'Unknown'}</h3>
                        <p className="text-sm text-muted-foreground">
                          Score: {quiz.score}/{quiz.total} ({Math.round((quiz.score / quiz.total) * 100)}%) · {quiz.step_index !== null ? `Step ${quiz.step_index + 1}` : 'Full topic'} · {new Date(quiz.completed_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        {quiz.wrong_questions && quiz.wrong_questions.length > 0 && (
                          <button onClick={() => handleRetryWrong(quiz)} className="text-xs px-2.5 py-1.5 rounded-md bg-warning/10 text-warning hover:bg-warning/20 transition-colors flex items-center gap-1 font-medium">
                            <RotateCcw className="h-3 w-3" /> Retry {quiz.wrong_questions.length}
                          </button>
                        )}
                        <div className={`h-2 w-2 rounded-full ${quiz.score / quiz.total >= 0.7 ? 'bg-success' : quiz.score / quiz.total >= 0.4 ? 'bg-warning' : 'bg-destructive'}`} />
                      </div>
                    </div>
                  </div>
                  <button onClick={() => handleDeleteQuiz(quiz.id)} className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 rounded-2xl glass-card border border-border/50">
              <Zap className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No quizzes yet</h3>
              <p className="text-muted-foreground mb-6">Test your knowledge with a quiz</p>
              <Button variant="glow" onClick={() => navigate('/my-quizzes')}><Plus className="h-4 w-4 mr-2" /> Take a Quiz</Button>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}
