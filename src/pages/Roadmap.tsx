import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, ArrowLeft, CheckCircle2, Circle, Sparkles, Target, Loader2, ChevronDown, ChevronUp, GraduationCap, Lightbulb, Search, Plus, Layers, ExternalLink, Play, FileText, Dumbbell, Library, Globe, Smartphone, MoreHorizontal, Download, Settings2, Type, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useModelPreferences } from '@/hooks/useModelPreferences';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import NotionExportDialog from '@/components/NotionExportDialog';

interface Resource {
  name: string;
  url: string;
  type: 'video' | 'website' | 'docs' | 'exercise';
}

interface Step {
  title: string;
  description: string;
  estimatedTime: string;
  resources?: (string | Resource)[];
  completed: boolean;
  order: number;
}

interface LessonData {
  sections: { heading: string; content: string }[];
  keyTakeaways: string[];
}

interface ExtraMaterial {
  name: string;
  url: string;
  description: string;
}

interface ExtraMaterials {
  videos: ExtraMaterial[];
  websites: ExtraMaterial[];
  books: ExtraMaterial[];
  apps: ExtraMaterial[];
  other: ExtraMaterial[];
}

interface RoadmapData {
  id: string;
  topic_id: string;
  steps: Step[];
  progress: number;
}

interface TopicData {
  id: string;
  title: string;
}

export default function Roadmap() {
  const { topicId } = useParams();
  const navigate = useNavigate();
  const modelPrefs = useModelPreferences();
  const { user } = useAuth();
  const [roadmap, setRoadmap] = useState<RoadmapData | null>(null);
  const [topic, setTopic] = useState<TopicData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [lessons, setLessons] = useState<Record<number, LessonData>>({});
  const [loadingLesson, setLoadingLesson] = useState<number | null>(null);
  const [generatingStepFlashcards, setGeneratingStepFlashcards] = useState<number | null>(null);
  const [generatingStepQuiz, setGeneratingStepQuiz] = useState<number | null>(null);
  const [deepDiveStep, setDeepDiveStep] = useState<number | null>(null);
  const [deepDiveQuery, setDeepDiveQuery] = useState('');
  const [loadingDeepDive, setLoadingDeepDive] = useState(false);
  const [generatingOverallQuiz, setGeneratingOverallQuiz] = useState(false);
  const [flashcardCount, setFlashcardCount] = useState(0);
  const [extraMaterials, setExtraMaterials] = useState<Record<number, ExtraMaterials>>({});
  const [loadingExtraMaterials, setLoadingExtraMaterials] = useState<number | null>(null);
  const [showExtraMaterials, setShowExtraMaterials] = useState<number | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportStepIndex, setExportStepIndex] = useState<number | null>(null);
  const [minWords, setMinWords] = useState<number | ''>('');
  const [maxWords, setMaxWords] = useState<number | ''>('');
  const [showWordSettings, setShowWordSettings] = useState(false);
  const [generatingMindmap, setGeneratingMindmap] = useState(false);

  // Calculate total word count across all generated lessons
  const totalWordCount = Object.values(lessons).reduce((total, lesson) => {
    const sectionWords = lesson.sections.reduce((sum, s) => sum + s.content.split(/\s+/).filter(Boolean).length + s.heading.split(/\s+/).filter(Boolean).length, 0);
    const takeawayWords = lesson.keyTakeaways.reduce((sum, t) => sum + t.split(/\s+/).filter(Boolean).length, 0);
    return total + sectionWords + takeawayWords;
  }, 0);

  useEffect(() => {
    async function fetchData() {
      if (!topicId || !user) return;
      const [topicRes, roadmapRes, flashcardRes] = await Promise.all([
        supabase.from('topics').select('*').eq('id', topicId).single(),
        supabase.from('roadmaps').select('*').eq('topic_id', topicId).single(),
        supabase.from('flashcards').select('id', { count: 'exact', head: true }).eq('topic_id', topicId),
      ]);
      if (topicRes.data) setTopic(topicRes.data);
      if (roadmapRes.data) setRoadmap(roadmapRes.data);
      setFlashcardCount(flashcardRes.count || 0);
      setLoading(false);
    }
    fetchData();
  }, [topicId, user]);

  const toggleStep = async (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!roadmap) return;
    const newSteps = [...roadmap.steps];
    newSteps[index].completed = !newSteps[index].completed;
    const completedCount = newSteps.filter((s) => s.completed).length;
    const progress = Math.round((completedCount / newSteps.length) * 100);
    setRoadmap({ ...roadmap, steps: newSteps, progress });
    await supabase.from('roadmaps').update({ steps: newSteps, progress }).eq('id', roadmap.id);
  };

  const handleExpandStep = async (index: number) => {
    if (expandedStep === index) {
      setExpandedStep(null);
      return;
    }
    setExpandedStep(index);
    if (!lessons[index] && roadmap && topic) {
      setLoadingLesson(index);
      try {
        const step = roadmap.steps[index];
        const { data, error } = await supabase.functions.invoke('generate-lesson', {
          body: {
            topicTitle: topic.title,
            stepTitle: step.title,
            stepDescription: step.description,
            ...(minWords ? { minWords: Number(minWords) } : {}),
            ...(maxWords ? { maxWords: Number(maxWords) } : {}),
            model: modelPrefs.lesson,
          },
        });
        if (error) throw error;
        if (data?.error) { toast.error(data.error); return; }
        setLessons((prev) => ({ ...prev, [index]: data }));
      } catch (e: any) {
        toast.error(e?.message || 'Failed to generate lesson');
        setExpandedStep(null);
      } finally {
        setLoadingLesson(null);
      }
    }
  };

  const handleStepFlashcards = async (stepIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!topic) return;
    setGeneratingStepFlashcards(stepIndex);
    try {
      const step = roadmap!.steps[stepIndex];
      const { data, error } = await supabase.functions.invoke('generate-flashcards', {
        body: { topicId, stepIndex, stepTitle: step.title, model: modelPrefs.quiz },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      setFlashcardCount((c) => c + (data.flashcards?.length || 0));
      toast.success(`Flashcards generated for "${step.title}"!`);
      navigate(`/flashcards/${topicId}?step=${stepIndex}`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to generate flashcards');
    } finally {
      setGeneratingStepFlashcards(null);
    }
  };

  const handleStepQuiz = async (stepIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!topic) return;
    setGeneratingStepQuiz(stepIndex);
    try {
      const step = roadmap!.steps[stepIndex];
      const { data, error } = await supabase.functions.invoke('generate-quiz', {
        body: { topicId, stepIndex, stepTitle: step.title, model: modelPrefs.quiz },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      toast.success('Quiz generated!');
      navigate(`/quiz/${topicId}`, {
        state: { questions: data.questions, topicTitle: data.topicTitle, stepIndex, stepTitle: step.title },
      });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to generate quiz');
    } finally {
      setGeneratingStepQuiz(null);
    }
  };

  const handleOverallQuiz = async () => {
    if (!topic) return;
    setGeneratingOverallQuiz(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-quiz', {
        body: { topicId },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      toast.success('Overall quiz generated!');
      navigate(`/quiz/${topicId}`, {
        state: { questions: data.questions, topicTitle: data.topicTitle },
      });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to generate quiz');
    } finally {
      setGeneratingOverallQuiz(false);
    }
  };

  const handleDeepDive = async (stepIndex: number) => {
    if (!deepDiveQuery.trim() || !topic || !roadmap) return;
    setLoadingDeepDive(true);
    try {
      const step = roadmap.steps[stepIndex];
      const existingHeadings = lessons[stepIndex]?.sections.map((s) => s.heading) || [];
      const { data, error } = await supabase.functions.invoke('generate-lesson', {
        body: {
          topicTitle: topic.title,
          stepTitle: `${step.title} — Deep Dive: ${deepDiveQuery.trim()}`,
          stepDescription: `The learner wants to explore "${deepDiveQuery.trim()}" in more depth within the context of "${step.title}" (part of "${topic.title}"). IMPORTANT: Do NOT repeat or cover any of these already-covered topics: ${existingHeadings.join(', ')}. Only provide NEW content about "${deepDiveQuery.trim()}".`,
        },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      setLessons((prev) => {
        const existing = prev[stepIndex];
        if (!existing) return { ...prev, [stepIndex]: data };
        return {
          ...prev,
          [stepIndex]: {
            sections: [...existing.sections, { heading: `🔍 Deep Dive: ${deepDiveQuery.trim()}`, content: '---' }, ...data.sections],
            keyTakeaways: [...existing.keyTakeaways, ...data.keyTakeaways],
          },
        };
      });
      setDeepDiveQuery('');
      setDeepDiveStep(null);
      toast.success('Deep dive content added!');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to generate deep dive');
    } finally {
      setLoadingDeepDive(false);
    }
  };

  const handleExtraMaterials = async (stepIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (showExtraMaterials === stepIndex) {
      setShowExtraMaterials(null);
      return;
    }
    setShowExtraMaterials(stepIndex);
    if (extraMaterials[stepIndex]) return;
    setLoadingExtraMaterials(stepIndex);
    try {
      const step = roadmap!.steps[stepIndex];
      const allSteps = roadmap!.steps.map((s, idx) => ({ index: idx, title: s.title, description: s.description }));
      const { data: topicData } = await supabase.from('topics').select('generation_context').eq('id', topicId).single();
      const { data, error } = await supabase.functions.invoke('generate-extra-materials', {
        body: {
          topicTitle: topic!.title,
          stepTitle: step.title,
          stepDescription: step.description,
          stepIndex,
          totalSteps: roadmap!.steps.length,
          allSteps,
          generationContext: topicData?.generation_context || null,
          model: modelPrefs.extra_materials,
        },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      setExtraMaterials((prev) => ({ ...prev, [stepIndex]: data }));
    } catch (e: any) {
      toast.error(e?.message || 'Failed to fetch extra materials');
      setShowExtraMaterials(null);
    } finally {
      setLoadingExtraMaterials(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!roadmap || !topic) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <p className="text-muted-foreground">Roadmap not found</p>
        <Button onClick={() => navigate('/dashboard')}>Go to Dashboard</Button>
      </div>
    );
  }

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
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Dashboard
          </Button>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-10 max-w-3xl relative z-10">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2 font-heading">
            <span className="gradient-text">{topic.title}</span>
          </h1>
          <p className="text-muted-foreground mb-4">Click on any step to study the lesson</p>

          {/* Topic-level actions */}
          <div className="flex flex-wrap gap-3 mb-6">
            <Button onClick={handleOverallQuiz} disabled={generatingOverallQuiz} variant="glow" size="sm">
              {generatingOverallQuiz ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Target className="h-4 w-4 mr-2" />}
              Take Full Quiz
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate(`/flashcards/${topicId}`)} disabled={flashcardCount === 0}>
              <Layers className="h-4 w-4 mr-2" />
              View Flashcards {flashcardCount > 0 && `(${flashcardCount})`}
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setExportStepIndex(null); setShowExportDialog(true); }}>
              <Download className="h-4 w-4 mr-2" />
              Export for Notion
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={generatingMindmap}
              onClick={async () => {
                setGeneratingMindmap(true);
                try {
                  const { data, error } = await supabase.functions.invoke('generate-mindmap', {
                    body: { topic: topic.title },
                  });
                  if (error) throw error;
                  if (data?.error) { toast.error(data.error); return; }
                  toast.success('Mindmap generated!');
                  navigate('/mindmap', { state: { mindmap: data.mindmap, fromTopic: topic.title, topicId: topic.id } });
                } catch (e: any) {
                  toast.error(e?.message || 'Failed to generate mindmap');
                } finally {
                  setGeneratingMindmap(false);
                }
              }}
            >
              {generatingMindmap ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <GitBranch className="h-4 w-4 mr-2" />}
              Mindmap
            </Button>
          </div>

          <NotionExportDialog
            open={showExportDialog}
            onOpenChange={setShowExportDialog}
            topicTitle={topic.title}
            steps={roadmap.steps}
            progress={roadmap.progress}
            extraMaterials={extraMaterials}
            lessons={lessons}
            stepIndex={exportStepIndex}
          />

          {/* Word Limit Settings */}
          <div className="mb-6">
            <button
              onClick={() => setShowWordSettings(!showWordSettings)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
            >
              <Settings2 className="h-4 w-4" />
              <span>Lesson Word Limit</span>
              {(minWords || maxWords) && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {minWords && maxWords ? `${minWords}–${maxWords}` : minWords ? `≥${minWords}` : `≤${maxWords}`} words
                </span>
              )}
              <ChevronDown className={`h-3 w-3 transition-transform ${showWordSettings ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
              {showWordSettings && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-border/50 glass-card">
                    <Type className="h-4 w-4 text-muted-foreground" />
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-muted-foreground">Min</label>
                      <input
                        type="number"
                        value={minWords}
                        onChange={(e) => setMinWords(e.target.value ? Number(e.target.value) : '')}
                        placeholder="e.g. 300"
                        min={50}
                        className="w-24 px-2 py-1.5 rounded-lg border border-border/50 bg-background/50 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-muted-foreground">Max</label>
                      <input
                        type="number"
                        value={maxWords}
                        onChange={(e) => setMaxWords(e.target.value ? Number(e.target.value) : '')}
                        placeholder="e.g. 1000"
                        min={50}
                        className="w-24 px-2 py-1.5 rounded-lg border border-border/50 bg-background/50 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                    {(minWords || maxWords) && (
                      <button
                        onClick={() => { setMinWords(''); setMaxWords(''); }}
                        className="text-xs text-muted-foreground hover:text-foreground underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5 ml-1">
                    Sets the word limit per step lesson. Only applies to newly generated lessons.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-semibold text-foreground">{roadmap.progress}%</span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <motion.div className="h-full gradient-primary rounded-full neon-glow-sm" initial={{ width: 0 }} animate={{ width: `${roadmap.progress}%` }} transition={{ duration: 0.5 }} />
            </div>
          </div>

          {/* Total Word Count */}
          {totalWordCount > 0 && (
            <div className="mb-10 flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" />
              <span>Total content generated: <strong className="text-foreground">{totalWordCount.toLocaleString()} words</strong></span>
              <span className="text-xs">({Object.keys(lessons).length} of {roadmap.steps.length} lessons)</span>
            </div>
          )}

          {/* Steps */}
          <div className="space-y-4">
            {roadmap.steps.map((step, i) => (
              <motion.div
                key={i}
                className={`rounded-2xl border transition-all ${
                  step.completed
                    ? 'glass-card border-primary/30 shadow-[0_0_16px_-4px_hsl(var(--neon-cyan)/0.2)]'
                    : expandedStep === i
                    ? 'glass-card border-primary/20'
                    : 'glass-card border-border/50 hover:border-primary/20'
                }`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
              >
                <div className="p-6 cursor-pointer" onClick={() => handleExpandStep(i)}>
                  <div className="flex items-start gap-4">
                    <div className="mt-0.5" onClick={(e) => toggleStep(i, e)}>
                      {step.completed ? (
                        <CheckCircle2 className="h-6 w-6 text-primary" />
                      ) : (
                        <Circle className="h-6 w-6 text-muted-foreground hover:text-primary transition-colors" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className={`font-semibold font-heading text-lg ${step.completed ? 'text-primary' : 'text-foreground'}`}>
                          Step {i + 1}: {step.title}
                        </h3>
                        {expandedStep === i ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                      </div>
                      <p className="text-muted-foreground text-sm leading-relaxed">{step.description}</p>
                      {step.resources && step.resources.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {step.resources.map((r, ri) => {
                            if (typeof r === 'string') {
                              return <span key={ri} className="text-xs px-2 py-1 rounded-md bg-muted text-muted-foreground">{r}</span>;
                            }
                            const resource = r as Resource;
                            const Icon = resource.type === 'video' ? Play : resource.type === 'docs' ? FileText : resource.type === 'exercise' ? Dumbbell : ExternalLink;
                            const colorClass = resource.type === 'video' ? 'text-destructive bg-destructive/10 hover:bg-destructive/20' : resource.type === 'docs' ? 'text-primary bg-primary/10 hover:bg-primary/20' : resource.type === 'exercise' ? 'text-secondary bg-secondary/10 hover:bg-secondary/20' : 'text-muted-foreground bg-muted hover:bg-muted/80';
                            return (
                              <a
                                key={ri}
                                href={resource.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md font-medium transition-colors ${colorClass}`}
                              >
                                <Icon className="h-3 w-3" />
                                {resource.name}
                                <ExternalLink className="h-2.5 w-2.5 opacity-50" />
                              </a>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Content */}
                <AnimatePresence>
                  {expandedStep === i && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
                      <div className="px-6 pb-6 border-t border-border/30 pt-6 ml-10">
                        {/* Step-level actions */}
                        <div className="flex flex-wrap gap-2 mb-6">
                          <Button variant="outline" size="sm" onClick={(e) => handleStepFlashcards(i, e)} disabled={generatingStepFlashcards === i}>
                            {generatingStepFlashcards === i ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                            Flashcards
                          </Button>
                          <Button variant="outline" size="sm" onClick={(e) => handleStepQuiz(i, e)} disabled={generatingStepQuiz === i}>
                            {generatingStepQuiz === i ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Target className="h-3 w-3 mr-1" />}
                            Quiz
                          </Button>
                          <Button variant="outline" size="sm" onClick={(e) => handleExtraMaterials(i, e)} disabled={loadingExtraMaterials === i}>
                            {loadingExtraMaterials === i ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Library className="h-3 w-3 mr-1" />}
                            Extra Materials
                          </Button>
                          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setExportStepIndex(i); setShowExportDialog(true); }}>
                            <Download className="h-3 w-3 mr-1" />
                            Export
                          </Button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeepDiveStep(deepDiveStep === i ? null : i); }}
                            className="h-8 w-8 rounded-full bg-primary/10 hover:bg-primary/20 flex items-center justify-center transition-colors"
                            title="Deep dive into a sub-topic"
                          >
                            <Search className="h-3.5 w-3.5 text-primary" />
                          </button>
                        </div>

                        {/* Extra Materials Panel */}
                        <AnimatePresence>
                          {showExtraMaterials === i && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mb-6">
                              {loadingExtraMaterials === i ? (
                                <div className="flex flex-col items-center py-6">
                                  <Loader2 className="h-6 w-6 text-primary animate-spin mb-2" />
                                  <p className="text-sm text-muted-foreground">Finding extra materials...</p>
                                </div>
                              ) : extraMaterials[i] ? (
                                <div className="rounded-2xl border border-border/50 glass-card p-4 space-y-4">
                                  {/* Videos */}
                                  {extraMaterials[i].videos?.length > 0 && (
                                    <div>
                                      <h5 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                                        <Play className="h-4 w-4 text-destructive" /> Videos
                                      </h5>
                                      <div className="space-y-2">
                                        {extraMaterials[i].videos.map((m, mi) => (
                                          <a key={mi} href={m.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors group">
                                            <Play className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                                            <div className="min-w-0">
                                              <p className="text-sm font-medium text-foreground group-hover:text-primary truncate">{m.name}</p>
                                              <p className="text-xs text-muted-foreground">{m.description}</p>
                                            </div>
                                            <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5 opacity-0 group-hover:opacity-100" />
                                          </a>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {/* Websites */}
                                  {extraMaterials[i].websites?.length > 0 && (
                                    <div>
                                      <h5 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                                        <Globe className="h-4 w-4 text-primary" /> Websites & Tutorials
                                      </h5>
                                      <div className="space-y-2">
                                        {extraMaterials[i].websites.map((m, mi) => (
                                          <a key={mi} href={m.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors group">
                                            <Globe className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                                            <div className="min-w-0">
                                              <p className="text-sm font-medium text-foreground group-hover:text-primary truncate">{m.name}</p>
                                              <p className="text-xs text-muted-foreground">{m.description}</p>
                                            </div>
                                            <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5 opacity-0 group-hover:opacity-100" />
                                          </a>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {/* Books */}
                                  {extraMaterials[i].books?.length > 0 && (
                                    <div>
                                      <h5 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                                        <BookOpen className="h-4 w-4 text-secondary" /> Books
                                      </h5>
                                      <div className="space-y-2">
                                        {extraMaterials[i].books.map((m, mi) => (
                                          <a key={mi} href={m.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors group">
                                            <BookOpen className="h-3.5 w-3.5 text-secondary mt-0.5 shrink-0" />
                                            <div className="min-w-0">
                                              <p className="text-sm font-medium text-foreground group-hover:text-primary truncate">{m.name}</p>
                                              <p className="text-xs text-muted-foreground">{m.description}</p>
                                            </div>
                                            <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5 opacity-0 group-hover:opacity-100" />
                                          </a>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {/* Apps */}
                                  {extraMaterials[i].apps?.length > 0 && (
                                    <div>
                                      <h5 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                                        <Smartphone className="h-4 w-4 text-warning" /> Apps & Tools
                                      </h5>
                                      <div className="space-y-2">
                                        {extraMaterials[i].apps.map((m, mi) => (
                                          <a key={mi} href={m.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors group">
                                            <Smartphone className="h-3.5 w-3.5 text-warning mt-0.5 shrink-0" />
                                            <div className="min-w-0">
                                              <p className="text-sm font-medium text-foreground group-hover:text-primary truncate">{m.name}</p>
                                              <p className="text-xs text-muted-foreground">{m.description}</p>
                                            </div>
                                            <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5 opacity-0 group-hover:opacity-100" />
                                          </a>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {/* Other */}
                                  {extraMaterials[i].other?.length > 0 && (
                                    <div>
                                      <h5 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                                        <MoreHorizontal className="h-4 w-4 text-muted-foreground" /> Other Resources
                                      </h5>
                                      <div className="space-y-2">
                                        {extraMaterials[i].other.map((m, mi) => (
                                          <a key={mi} href={m.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors group">
                                            <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                                            <div className="min-w-0">
                                              <p className="text-sm font-medium text-foreground group-hover:text-primary truncate">{m.name}</p>
                                              <p className="text-xs text-muted-foreground">{m.description}</p>
                                            </div>
                                            <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5 opacity-0 group-hover:opacity-100" />
                                          </a>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : null}
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* Deep dive input */}
                        <AnimatePresence>
                          {deepDiveStep === i && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mb-6">
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={deepDiveQuery}
                                  onChange={(e) => setDeepDiveQuery(e.target.value)}
                                  placeholder="Enter a sub-topic to dive deeper into..."
                                  className="flex-1 px-3 py-2 rounded-lg border border-border/50 bg-background/50 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                                  onKeyDown={(e) => e.key === 'Enter' && handleDeepDive(i)}
                                />
                                <Button size="sm" onClick={() => handleDeepDive(i)} disabled={loadingDeepDive || !deepDiveQuery.trim()}>
                                  {loadingDeepDive ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                                </Button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* Lesson content */}
                        {loadingLesson === i ? (
                          <div className="flex flex-col items-center py-8">
                            <Loader2 className="h-8 w-8 text-primary animate-spin mb-3" />
                            <p className="text-muted-foreground">Generating lesson content...</p>
                          </div>
                        ) : lessons[i] ? (
                          <div className="space-y-6">
                            {lessons[i].sections.map((section, si) => (
                              <div key={si}>
                                <h4 className="text-base font-bold text-foreground mb-2 flex items-center gap-2">
                                  <GraduationCap className="h-4 w-4 text-primary" />
                                  {section.heading}
                                </h4>
                                <div className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">{section.content}</div>
                              </div>
                            ))}
                            {lessons[i].keyTakeaways && lessons[i].keyTakeaways.length > 0 && (
                              <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10">
                                <h4 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                                  <Lightbulb className="h-4 w-4 text-primary" /> Key Takeaways
                                </h4>
                                <ul className="space-y-2">
                                  {lessons[i].keyTakeaways.map((takeaway, ti) => (
                                    <li key={ti} className="text-sm text-foreground/80 flex items-start gap-2">
                                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                                      {takeaway}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {/* Per-lesson word count */}
                            {(() => {
                              const lessonWords = lessons[i].sections.reduce((sum, s) => sum + s.content.split(/\s+/).filter(Boolean).length + s.heading.split(/\s+/).filter(Boolean).length, 0)
                                + lessons[i].keyTakeaways.reduce((sum, t) => sum + t.split(/\s+/).filter(Boolean).length, 0);
                              return (
                                <p className="text-[11px] text-muted-foreground/60 mt-3 text-right">
                                  {lessonWords.toLocaleString()} words
                                </p>
                              );
                            })()}
                            {!step.completed && (
                              <Button variant="outline" size="sm" onClick={(e) => toggleStep(i, e)} className="mt-2">
                                <CheckCircle2 className="h-4 w-4 mr-2" /> Mark as Complete
                              </Button>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>

          {/* Bottom sections */}
          <div className="mt-12 space-y-4">
            <motion.div
              className="rounded-2xl border border-border/50 glass-card p-6"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: roadmap.steps.length * 0.05 }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Target className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold font-heading text-lg text-foreground">Overall Quiz</h3>
                    <p className="text-sm text-muted-foreground">Test your knowledge across all steps</p>
                  </div>
                </div>
                <Button variant="glow" size="sm" onClick={handleOverallQuiz} disabled={generatingOverallQuiz}>
                  {generatingOverallQuiz ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Target className="h-4 w-4 mr-2" />}
                  Take Quiz
                </Button>
              </div>
            </motion.div>

            <motion.div
              className="rounded-2xl border border-border/50 glass-card p-6"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: roadmap.steps.length * 0.05 + 0.05 }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-secondary/10 flex items-center justify-center">
                    <Layers className="h-5 w-5 text-secondary" />
                  </div>
                  <div>
                    <h3 className="font-semibold font-heading text-lg text-foreground">All Flashcards</h3>
                    <p className="text-sm text-muted-foreground">
                      {flashcardCount > 0
                        ? `${flashcardCount} cards compiled from all steps`
                        : 'Generate flashcards from any step above first'}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => navigate(`/flashcards/${topicId}`)}
                  disabled={flashcardCount === 0}
                >
                  <Layers className="h-4 w-4 mr-2" />
                  View All Cards
                </Button>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
