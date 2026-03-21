import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BookOpen, ArrowLeft, Zap, Trash2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { ThemeToggle } from '@/components/ThemeToggle';
import QuizCreator from '@/components/QuizCreator';

interface QuizResult {
  id: string;
  topic_id: string;
  score: number;
  total: number;
  step_index: number | null;
  wrong_questions: any[];
  questions: any[];
  completed_at: string;
  topics: { title: string } | null;
}

export default function MyQuizzes() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [quizResults, setQuizResults] = useState<QuizResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from('quiz_results').select('id, topic_id, score, total, step_index, wrong_questions, questions, completed_at, topics(title)').eq('user_id', user.id).order('completed_at', { ascending: false })
      .then(({ data }) => { setQuizResults((data as any) || []); setLoading(false); });
  }, [user]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this quiz result?')) return;
    await supabase.from('quiz_results').delete().eq('id', id);
    setQuizResults(prev => prev.filter(q => q.id !== id));
    toast.success('Quiz result deleted');
  };

  const handleRetryWrong = (quiz: QuizResult) => {
    if (!quiz.wrong_questions || quiz.wrong_questions.length === 0) return;
    navigate(`/quiz/${quiz.topic_id}`, {
      state: { questions: quiz.wrong_questions, topicTitle: quiz.topics?.title || 'Quiz', stepIndex: quiz.step_index ?? undefined, retryMode: true },
    });
  };

  const quizByTopic: Record<string, { title: string; quizzes: QuizResult[] }> = {};
  quizResults.forEach(q => {
    if (!quizByTopic[q.topic_id]) quizByTopic[q.topic_id] = { title: q.topics?.title || 'Unknown', quizzes: [] };
    quizByTopic[q.topic_id].quizzes.push(q);
  });

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
                <Zap className="h-8 w-8 text-warning" /> Quizzes
              </h1>
              <p className="text-muted-foreground mt-1">Create and review your quizzes</p>
            </div>
          </div>

          {/* Creator */}
          <div className="mb-10">
            <QuizCreator />
          </div>

          {/* Quiz Results */}
          <div>
            <h2 className="font-heading font-bold text-foreground text-lg mb-4">Quiz Results</h2>
            {loading ? (
              <div className="grid gap-3">{[1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl shimmer-cyan" />)}</div>
            ) : Object.keys(quizByTopic).length > 0 ? (
              <div className="space-y-6">
                {Object.entries(quizByTopic).map(([topicId, { title, quizzes }]) => (
                  <div key={topicId}>
                    <h3 className="font-heading font-bold text-foreground mb-3 text-lg">{title}</h3>
                    <div className="grid gap-2 ml-2">
                      {quizzes.map(quiz => (
                        <div key={quiz.id} className="flex items-center gap-2">
                          <div className="flex-1 p-4 rounded-2xl glass-card border border-border/50">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-foreground">
                                  Score: {quiz.score}/{quiz.total} ({Math.round((quiz.score / quiz.total) * 100)}%)
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {quiz.step_index !== null ? `Step ${quiz.step_index + 1}` : 'Full topic'} · {new Date(quiz.completed_at).toLocaleDateString()}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                {quiz.wrong_questions && quiz.wrong_questions.length > 0 && (
                                  <button onClick={() => handleRetryWrong(quiz)}
                                    className="text-xs px-2.5 py-1.5 rounded-md bg-warning/10 text-warning hover:bg-warning/20 transition-colors flex items-center gap-1 font-medium">
                                    <RotateCcw className="h-3 w-3" /> Retry {quiz.wrong_questions.length}
                                  </button>
                                )}
                                <div className={`h-2 w-2 rounded-full ${quiz.score / quiz.total >= 0.7 ? 'bg-success' : quiz.score / quiz.total >= 0.4 ? 'bg-warning' : 'bg-destructive'}`} />
                              </div>
                            </div>
                          </div>
                          <button onClick={() => handleDelete(quiz.id)} className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8 glass-card rounded-2xl border border-border/50">No quiz results yet. Use the creator above to generate a quiz!</p>
            )}
          </div>
        </motion.div>
      </main>
    </div>
  );
}
