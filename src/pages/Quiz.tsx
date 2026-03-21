import { useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BookOpen, ArrowLeft, CheckCircle2, XCircle, Trophy, RotateCcw, Plus, Minus, Loader2, Sparkles, Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface Question {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export default function Quiz() {
  const { topicId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const questions: Question[] = location.state?.questions || [];
  const topicTitle: string = location.state?.topicTitle || 'Quiz';
  const stepIndex: number | undefined = location.state?.stepIndex;
  const stepTitle: string | undefined = location.state?.stepTitle;
  const retryMode: boolean = location.state?.retryMode || false;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [wrongQuestions, setWrongQuestions] = useState<Question[]>([]);
  const [showGenerateMore, setShowGenerateMore] = useState(false);
  const [generateMoreCount, setGenerateMoreCount] = useState(10);
  const [generatingMore, setGeneratingMore] = useState(false);

  const isCustomQuiz = topicId === 'custom';

  if (questions.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <p className="text-muted-foreground">No quiz data. Generate a quiz from your roadmap first.</p>
        <Button onClick={() => navigate(topicId ? `/roadmap/${topicId}` : '/dashboard')}>Go Back</Button>
      </div>
    );
  }

  const currentQ = questions[currentIndex];

  const handleSelect = (optionIndex: number) => {
    if (showResult) return;
    setSelectedAnswer(optionIndex);
    setShowResult(true);
    const isCorrect = optionIndex === currentQ.correctIndex;
    if (isCorrect) {
      setScore((s) => s + 1);
    } else {
      setWrongQuestions((prev) => [...prev, currentQ]);
    }
  };

  const handleNext = async () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
      setSelectedAnswer(null);
      setShowResult(false);
    } else {
      setFinished(true);
      // Calculate final score including current answer
      const finalScore = selectedAnswer === currentQ.correctIndex ? score + 1 : score;
      const finalWrong = selectedAnswer !== currentQ.correctIndex ? [...wrongQuestions, currentQ] : wrongQuestions;
      if (user && topicId && !isCustomQuiz) {
        try {
          await supabase.from('quiz_results').insert({
            topic_id: isCustomQuiz ? topicId : topicId,
            user_id: user.id,
            score: finalScore,
            total: questions.length,
            questions,
            step_index: stepIndex ?? null,
            wrong_questions: finalWrong,
          });
        } catch (e) {
          console.error('Failed to save quiz result', e);
        }
      }
    }
  };

  const handleRetryWrong = () => {
    if (wrongQuestions.length === 0) return;
    navigate(`/quiz/${topicId}`, {
      state: {
        questions: wrongQuestions,
        topicTitle,
        stepIndex,
        stepTitle,
        retryMode: true,
      },
      replace: true,
    });
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setShowResult(false);
    setScore(0);
    setFinished(false);
    setWrongQuestions([]);
  };

  if (finished) {
    const percentage = Math.round((score / questions.length) * 100);
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
          </div>
        </nav>
        <main className="container mx-auto px-4 py-16 max-w-lg text-center relative z-10">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
            <Trophy className={`h-16 w-16 mx-auto mb-6 ${percentage >= 70 ? 'text-primary' : 'text-muted-foreground'}`} />
            <h1 className="text-3xl font-bold text-foreground mb-2 font-heading">
              {retryMode ? 'Retry Complete!' : 'Quiz Complete!'}
            </h1>
            <p className="text-muted-foreground text-lg mb-1">{topicTitle}</p>
            {stepTitle && <p className="text-sm text-muted-foreground mb-8">Step: {stepTitle}</p>}
            {!stepTitle && <div className="mb-8" />}

            <div className="p-8 rounded-2xl glass-card border border-border/50 mb-8">
              <p className="text-5xl font-bold text-foreground mb-2">{score}/{questions.length}</p>
              <p className="text-muted-foreground text-lg">{percentage}% correct</p>
              <div className="h-3 bg-muted rounded-full overflow-hidden mt-4">
                <motion.div
                  className={`h-full rounded-full ${percentage >= 70 ? 'gradient-primary neon-glow-sm' : percentage >= 40 ? 'bg-warning' : 'bg-destructive'}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${percentage}%` }}
                  transition={{ duration: 0.8, delay: 0.3 }}
                />
              </div>
            </div>

            {wrongQuestions.length > 0 && (
              <div className="text-left mb-8 p-5 rounded-2xl bg-destructive/5 border border-destructive/20">
                <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-destructive" />
                  Questions to Review ({wrongQuestions.length})
                </h3>
                <ul className="space-y-3">
                  {wrongQuestions.map((q, i) => (
                    <li key={i} className="text-sm text-foreground/80">
                      <p className="font-medium">{q.question}</p>
                      <p className="text-muted-foreground mt-1">✓ {q.options[q.correctIndex]}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Generate More Questions */}
            {showGenerateMore ? (
              <div className="max-w-xs mx-auto mb-6 p-4 rounded-2xl glass-card border border-border/50">
                <p className="text-sm font-medium text-foreground mb-3">How many more questions?</p>
                <div className="flex items-center justify-center gap-3 mb-3">
                  <button
                    onClick={() => setGenerateMoreCount(Math.max(1, generateMoreCount - 5))}
                    className="h-9 w-9 rounded-lg border border-border hover:border-primary/30 hover:bg-primary/10 text-muted-foreground hover:text-primary flex items-center justify-center transition-all"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={generateMoreCount}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      if (!isNaN(v)) setGenerateMoreCount(Math.max(1, Math.min(30, v)));
                    }}
                    className="w-16 h-9 text-center rounded-lg border border-border bg-background text-foreground text-lg font-bold focus:outline-none focus:ring-2 focus:ring-primary/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button
                    onClick={() => setGenerateMoreCount(Math.min(30, generateMoreCount + 5))}
                    className="h-9 w-9 rounded-lg border border-border hover:border-primary/30 hover:bg-primary/10 text-muted-foreground hover:text-primary flex items-center justify-center transition-all"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="glow"
                    size="sm"
                    className="flex-1"
                    disabled={generatingMore}
                    onClick={async () => {
                      setGeneratingMore(true);
                      try {
                        let newQuestions: Question[] = [];
                        if (isCustomQuiz) {
                          // For custom quizzes, generate more using the topic title as context
                          const { data, error: fnError } = await supabase.functions.invoke('generate-document-quiz', {
                            body: {
                              content: `Generate quiz questions about: ${topicTitle}`,
                              title: topicTitle,
                              selectedTopics: [{ name: topicTitle, subtopics: [] }],
                              totalQuestions: generateMoreCount,
                            },
                          });
                          if (fnError) throw fnError;
                          if (data?.error) throw new Error(data.error);
                          newQuestions = data.questions;
                        } else {
                          // For roadmap quizzes
                          const { data, error: fnError } = await supabase.functions.invoke('generate-quiz', {
                            body: { topicId, stepIndex, stepTitle, questionCount: generateMoreCount },
                          });
                          if (fnError) throw fnError;
                          if (data?.error) throw new Error(data.error);
                          newQuestions = data.questions;
                        }
                        // Navigate with combined questions
                        const combinedQuestions = [...questions, ...newQuestions];
                        navigate(`/quiz/${topicId || 'custom'}`, {
                          state: {
                            questions: combinedQuestions,
                            topicTitle,
                            stepIndex,
                            stepTitle,
                            retryMode: false,
                          },
                          replace: true,
                        });
                        // Reset state for new quiz
                        setCurrentIndex(0);
                        setSelectedAnswer(null);
                        setShowResult(false);
                        setScore(0);
                        setFinished(false);
                        setWrongQuestions([]);
                        setShowGenerateMore(false);
                        toast.success(`${newQuestions.length} more questions added! Total: ${combinedQuestions.length}`);
                      } catch (err: any) {
                        toast.error(err.message || 'Failed to generate more questions');
                      } finally {
                        setGeneratingMore(false);
                      }
                    }}
                  >
                    {generatingMore ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                    Generate {generateMoreCount}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowGenerateMore(false)} disabled={generatingMore}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mb-4">
                <Button variant="outline" onClick={() => setShowGenerateMore(true)} className="mx-auto">
                  <Plus className="h-4 w-4 mr-2" /> Generate More Questions
                </Button>
              </div>
            )}

            {/* Export Options */}
            <div className="flex justify-center gap-2 mb-6">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const escapeCsv = (s: string) => {
                    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
                    return s;
                  };
                  const rows = ['Question,Correct Answer,Your Options,Explanation'];
                  questions.forEach(q => {
                    rows.push(`${escapeCsv(q.question)},${escapeCsv(q.options[q.correctIndex])},${escapeCsv(q.options.join(' | '))},${escapeCsv(q.explanation)}`);
                  });
                  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${topicTitle || 'quiz'}-results.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                  toast.success(`Exported ${questions.length} questions as CSV`);
                }}
              >
                <Download className="h-4 w-4 mr-1" /> Export CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  let text = `${topicTitle}\nScore: ${score}/${questions.length} (${percentage}%)\n${'─'.repeat(40)}\n\n`;
                  questions.forEach((q, i) => {
                    text += `Q${i + 1}: ${q.question}\n`;
                    q.options.forEach((opt, oi) => {
                      text += `  ${String.fromCharCode(65 + oi)}) ${opt}${oi === q.correctIndex ? ' ✓' : ''}\n`;
                    });
                    text += `  Explanation: ${q.explanation}\n\n`;
                  });
                  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${topicTitle || 'quiz'}-results.txt`;
                  a.click();
                  URL.revokeObjectURL(url);
                  toast.success(`Exported ${questions.length} questions as text`);
                }}
              >
                <Download className="h-4 w-4 mr-1" /> Export Text
              </Button>
            </div>

            <div className="flex flex-col gap-3">
              {wrongQuestions.length > 0 && (
                <Button onClick={handleRetryWrong} variant="glow" className="gap-2">
                  <RotateCcw className="h-4 w-4" />
                  Retry Wrong Questions ({wrongQuestions.length})
                </Button>
              )}
              {!isCustomQuiz && <Button variant={wrongQuestions.length > 0 ? 'outline' : 'glow'} onClick={() => navigate(`/roadmap/${topicId}`)}>Back to Roadmap</Button>}
              <Button variant={isCustomQuiz && wrongQuestions.length === 0 ? 'glow' : 'outline'} onClick={() => navigate('/dashboard')}>Dashboard</Button>
            </div>
          </motion.div>
        </main>
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
          <div className="flex items-center gap-3">
            {retryMode && <span className="text-xs px-2 py-1 rounded-md bg-warning/10 text-warning font-medium">Retry Mode</span>}
            {stepTitle && <span className="text-xs text-muted-foreground hidden sm:block">{stepTitle}</span>}
            <Button variant="ghost" size="sm" onClick={() => navigate(isCustomQuiz ? '/dashboard' : `/roadmap/${topicId}`)}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Exit Quiz
            </Button>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-10 max-w-2xl relative z-10">
        <div className="mb-8">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-muted-foreground">Question {currentIndex + 1} of {questions.length}</span>
            <span className="font-semibold text-foreground">Score: {score}</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full gradient-primary rounded-full transition-all" style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }} />
          </div>
        </div>

        <motion.div key={currentIndex} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
          <h2 className="text-xl md:text-2xl font-bold text-foreground mb-8 font-heading leading-relaxed">{currentQ.question}</h2>
          <div className="space-y-3 mb-8">
            {currentQ.options.map((option, oi) => {
              let classes = 'w-full text-left p-5 rounded-2xl border-2 transition-all ';
              if (showResult) {
                if (oi === currentQ.correctIndex) {
                  classes += 'bg-success/10 border-success/40 text-foreground animate-correct-pulse';
                } else if (oi === selectedAnswer && oi !== currentQ.correctIndex) {
                  classes += 'bg-destructive/10 border-destructive/40 text-foreground animate-wrong-shake';
                } else {
                  classes += 'glass-card border-border/30 text-muted-foreground opacity-60';
                }
              } else {
                classes += 'glass-card border-border/50 text-foreground hover:border-primary/30 hover:shadow-[0_0_12px_-3px_hsl(var(--neon-cyan)/0.2)] cursor-pointer';
              }
              return (
                <button key={oi} className={classes} onClick={() => handleSelect(oi)} disabled={showResult}>
                  <div className="flex items-center gap-3">
                    <span className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-semibold shrink-0">{String.fromCharCode(65 + oi)}</span>
                    <span className="text-base">{option}</span>
                    {showResult && oi === currentQ.correctIndex && <CheckCircle2 className="h-5 w-5 text-success ml-auto shrink-0" />}
                    {showResult && oi === selectedAnswer && oi !== currentQ.correctIndex && <XCircle className="h-5 w-5 text-destructive ml-auto shrink-0" />}
                  </div>
                </button>
              );
            })}
          </div>

          {showResult && (
            <motion.div className="p-5 rounded-2xl glass-card border border-border/50 mb-6" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <p className="text-sm font-medium text-muted-foreground mb-1">Explanation</p>
              <p className="text-foreground">{currentQ.explanation}</p>
            </motion.div>
          )}

          {showResult && (
            <Button onClick={handleNext} variant="glow" className="w-full py-5" size="lg">
              {currentIndex < questions.length - 1 ? 'Next Question' : 'See Results'}
            </Button>
          )}
        </motion.div>
      </main>
    </div>
  );
}