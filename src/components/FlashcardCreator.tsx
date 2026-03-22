import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Link, FileText, Loader2, ChevronRight, ChevronLeft, Sparkles, X, Plus, Minus, Check, AlertCircle, Youtube } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase';
import * as pdfjsLib from 'pdfjs-dist';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface TopicAnalysis {
  name: string;
  subtopics: string[];
  estimatedCards: number;
  selected: boolean;
}

interface Analysis {
  title: string;
  topics: TopicAnalysis[];
  totalRecommendedCards: number;
  summary: string;
}

type InputMode = 'file' | 'url' | 'text';
type Step = 'input' | 'analyzing' | 'review' | 'generating' | 'done';

async function extractTextFromFile(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'txt' || ext === 'md' || ext === 'csv' || ext === 'json' || ext === 'xml') {
    return file.text();
  }

  if (ext === 'pdf') {
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();
const arrayBuffer = await file.arrayBuffer();
const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      let text = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((item: any) => item.str).join(' ') + '\n';
      }
      return text;
    } catch {
      throw new Error('Failed to parse PDF. Please try pasting the text directly.');
    }
  }

  if (ext === 'docx') {
    try {
      const mammoth = await import('mammoth');
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value;
    } catch {
      throw new Error('Failed to parse DOCX. Please try pasting the text directly.');
    }
  }

  try {
    return await file.text();
  } catch {
    throw new Error(`Unsupported file type: .${ext}. Try TXT, PDF, DOCX, MD, or CSV.`);
  }
}

export default function FlashcardCreator() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('input');
  const [inputMode, setInputMode] = useState<InputMode>('file');
  const [url, setUrl] = useState('');
  const [textContent, setTextContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [extractedContent, setExtractedContent] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [totalCards, setTotalCards] = useState(0);
  const [result, setResult] = useState<{ topicId: string; title: string; cardsGenerated: number } | null>(null);
  const [error, setError] = useState('');
  const [scopeInstructions, setScopeInstructions] = useState('');
  const [addMoreCount, setAddMoreCount] = useState(10);
  const [showAddMore, setShowAddMore] = useState(false);
  const [addingMore, setAddingMore] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setError('File size must be under 20MB');
      return;
    }
    setError('');
    setFileName(file.name);
    try {
      const text = await extractTextFromFile(file);
      if (text.trim().length < 50) {
        setError('Extracted text is too short. Please try a different file.');
        return;
      }
      setExtractedContent(text);
    } catch (err: any) {
      setError(err.message || 'Failed to read file');
    }
  };

  const isYouTubeUrl = (urlStr: string) => {
    return /(?:youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)/.test(urlStr);
  };

  const handleAnalyze = async () => {
    setError('');
    setStep('analyzing');

    try {
      let body: any = {};
      if (inputMode === 'url') {
        if (!url.trim()) throw new Error('Please enter a URL');
        const cleanUrl = url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`;

        if (isYouTubeUrl(cleanUrl)) {
          setStep('generating');
          const { data, error: fnError } = await supabase.functions.invoke('youtube-flashcards', {
            body: { url: cleanUrl, cardCount: 20 },
          });
          if (fnError) throw fnError;
          if (data?.error) throw new Error(data.error);

          setResult(data);
          setStep('done');
          toast.success(`${data.cardsGenerated} flashcards generated from YouTube video!`);
          return;
        } else {
          body.url = cleanUrl;
        }
      } else if (inputMode === 'text') {
        if (textContent.trim().length < 50) throw new Error('Please enter more text (at least 50 characters)');
        body.content = textContent.trim();
        setExtractedContent(textContent.trim());
      } else {
        if (!extractedContent) throw new Error('Please upload a file first');
        body.content = extractedContent;
      }
      if (scopeInstructions.trim()) {
        body.scope = scopeInstructions.trim();
      }

      const { data, error: fnError } = await supabase.functions.invoke('analyze-document', { body });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      const analysisData = data.analysis;
      analysisData.topics = analysisData.topics.map((t: any) => ({ ...t, selected: true }));

      if (inputMode === 'url' && !extractedContent) {
        setExtractedContent('[Content fetched from URL]');
      }

      setAnalysis(analysisData);
      setTotalCards(analysisData.totalRecommendedCards);
      setStep('review');
    } catch (err: any) {
      setError(err.message || 'Analysis failed');
      setStep('input');
    }
  };

  const handleToggleTopic = (index: number) => {
    if (!analysis) return;
    const updated = { ...analysis };
    updated.topics = [...updated.topics];
    updated.topics[index] = { ...updated.topics[index], selected: !updated.topics[index].selected };
    setAnalysis(updated);

    const newTotal = updated.topics
      .filter((t) => t.selected)
      .reduce((sum, t) => sum + t.estimatedCards, 0);
    setTotalCards(newTotal);
  };

  const handleRemoveSubtopic = (topicIndex: number, subtopicIndex: number) => {
    if (!analysis) return;
    const updated = { ...analysis };
    updated.topics = [...updated.topics];
    updated.topics[topicIndex] = {
      ...updated.topics[topicIndex],
      subtopics: updated.topics[topicIndex].subtopics.filter((_, i) => i !== subtopicIndex),
    };
    setAnalysis(updated);
  };

  const handleGenerate = async () => {
    if (!analysis) return;
    setError('');
    setStep('generating');

    const selectedTopics = analysis.topics.filter((t) => t.selected);
    if (selectedTopics.length === 0) {
      setError('Please select at least one topic');
      setStep('review');
      return;
    }

    try {
      const body: any = {
        content: extractedContent || `[URL content: ${url}]`,
        title: analysis.title,
        selectedTopics: selectedTopics.map((t) => ({ name: t.name, subtopics: t.subtopics })),
        totalCards,
      };
      if (scopeInstructions.trim()) {
        body.scope = scopeInstructions.trim();
      }

      const { data, error: fnError } = await supabase.functions.invoke('generate-document-flashcards', { body });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      setResult(data);
      setStep('done');
      toast.success(`${data.cardsGenerated} flashcards generated!`);
    } catch (err: any) {
      setError(err.message || 'Generation failed');
      setStep('review');
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <AnimatePresence mode="wait">
        {/* STEP 1: Input */}
        {step === 'input' && (
          <motion.div key="input" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}>
            <h2 className="text-xl font-heading font-bold text-foreground mb-2">Create Flashcards</h2>
            <p className="text-muted-foreground mb-6">Upload a file, paste a URL, or enter text to generate flashcards.</p>

            {/* Mode Selector */}
            <div className="flex gap-2 mb-6">
              {[
                { mode: 'file' as InputMode, icon: Upload, label: 'Upload File' },
                { mode: 'url' as InputMode, icon: Link, label: 'Paste URL' },
                { mode: 'text' as InputMode, icon: FileText, label: 'Paste Text' },
              ].map(({ mode, icon: Icon, label }) => (
                <button
                  key={mode}
                  onClick={() => { setInputMode(mode); setError(''); }}
                  className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                    inputMode === mode
                      ? 'border-primary bg-primary/5 text-primary animate-neon-border'
                      : 'border-border glass-card text-muted-foreground hover:border-primary/30'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-sm font-medium">{label}</span>
                </button>
              ))}
            </div>

            {/* Input Area */}
            {inputMode === 'file' && (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.pdf,.docx,.doc,.md,.csv,.json,.xml"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full p-8 rounded-2xl border-2 border-dashed border-border hover:border-primary/40 glass-card hover:bg-primary/5 transition-all text-center"
                >
                  <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-foreground font-medium mb-1">
                    {fileName || 'Click to upload'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Supports PDF, DOCX, TXT, MD, CSV · Max 20MB
                  </p>
                </button>
                {fileName && extractedContent && (
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-sm text-success flex items-center gap-1">
                      <Check className="h-4 w-4" /> File loaded: {fileName} ({Math.round(extractedContent.length / 1000)}k chars)
                    </p>
                    <button
                      onClick={() => {
                        setFileName('');
                        setExtractedContent('');
                        setError('');
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="text-sm text-red-400 hover:text-red-300 flex items-center gap-1 ml-4"
                    >
                      <X className="h-4 w-4" /> Remove
                    </button>
                  </div>
                )}
              </div>
            )}

            {inputMode === 'url' && (
              <div>
                <Input
                  type="url"
                  placeholder="https://example.com/article or YouTube video URL"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="h-12"
                />
                {url && isYouTubeUrl(url) && (
                  <p className="text-sm text-secondary mt-2 flex items-center gap-1">
                    <Youtube className="h-4 w-4" /> YouTube detected — AI will generate flashcards from the video topic
                  </p>
                )}
              </div>
            )}

            {inputMode === 'text' && (
              <Textarea
                placeholder="Paste your study material, notes, or any text content here..."
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                rows={8}
                className="resize-none"
              />
            )}

            {/* Focus/Scope Instructions */}
            <div className="mt-4">
              <label className="text-sm font-medium text-foreground mb-1.5 block">Focus Instructions <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Textarea
                placeholder="e.g., Focus only on chapter 3, or only cover key formulas, or narrow down to specific concepts..."
                value={scopeInstructions}
                onChange={(e) => setScopeInstructions(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive mt-3 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" /> {error}
              </p>
            )}

            <Button
              onClick={() => handleAnalyze()}
              variant="glow"
              className="w-full mt-6 h-12"
              disabled={
                (inputMode === 'file' && !extractedContent) ||
                (inputMode === 'url' && !url.trim()) ||
                (inputMode === 'text' && textContent.trim().length < 50)
              }
            >
              <Sparkles className="h-4 w-4 mr-2" /> Analyze Content
            </Button>
          </motion.div>
        )}

        {/* STEP 2: Analyzing */}
        {step === 'analyzing' && (
          <motion.div key="analyzing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-16">
            <Loader2 className="h-10 w-10 text-primary animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-1">Analyzing your content...</h3>
            <p className="text-sm text-muted-foreground">Identifying topics and subtopics</p>
          </motion.div>
        )}

        {/* STEP 3: Review */}
        {step === 'review' && analysis && (
          <motion.div key="review" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-heading font-bold text-foreground">{analysis.title}</h2>
                <p className="text-sm text-muted-foreground">{analysis.summary}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setStep('input'); setAnalysis(null); }}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            </div>

            {/* Topics list */}
            <div className="space-y-3 mb-6">
              {analysis.topics.map((topic, i) => (
                <div
                  key={i}
                  className={`p-4 rounded-2xl border-2 transition-all ${
                    topic.selected ? 'border-primary/30 glass-card' : 'border-border glass-card opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <button
                      onClick={() => handleToggleTopic(i)}
                      className="flex items-center gap-2 flex-1 text-left"
                    >
                      <div className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
                        topic.selected ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                      }`}>
                        {topic.selected && <Check className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      <span className="font-semibold text-foreground">{topic.name}</span>
                    </button>
                    <span className="text-xs text-muted-foreground">~{topic.estimatedCards} cards</span>
                  </div>
                  {topic.selected && topic.subtopics.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 ml-7">
                      {topic.subtopics.map((sub, j) => (
                        <span key={j} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
                          {sub}
                          <button onClick={() => handleRemoveSubtopic(i, j)} className="hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Card count adjuster */}
            <div className="p-5 rounded-2xl glass-card border border-border/50 mb-6">
              <p className="text-sm font-medium text-foreground mb-3">Total flashcards to generate</p>
              <div className="flex items-center justify-center gap-4">
                <Button variant="outline" size="icon" onClick={() => setTotalCards(Math.max(5, totalCards - 5))}>
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="text-3xl font-bold text-foreground w-20 text-center">{totalCards}</span>
                <Button variant="outline" size="icon" onClick={() => setTotalCards(Math.min(200, totalCards + 5))}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center mt-2">
                Recommended: {analysis.totalRecommendedCards} cards
              </p>
            </div>

            {error && (
              <p className="text-sm text-destructive mb-4 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" /> {error}
              </p>
            )}

            <Button onClick={handleGenerate} variant="glow" className="w-full h-12">
              <Sparkles className="h-4 w-4 mr-2" /> Generate {totalCards} Flashcards
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </motion.div>
        )}

        {/* STEP 4: Generating */}
        {step === 'generating' && (
          <motion.div key="generating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-16">
            <Loader2 className="h-10 w-10 text-primary animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-1">Generating flashcards...</h3>
            <p className="text-sm text-muted-foreground">Creating {totalCards} cards from your content</p>
          </motion.div>
        )}

        {/* STEP 5: Done */}
        {step === 'done' && result && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-12">
            <div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
              <Check className="h-8 w-8 text-success" />
            </div>
            <h3 className="text-2xl font-heading font-bold text-foreground mb-2">Flashcards Ready!</h3>
            <p className="text-muted-foreground mb-1">{result.title}</p>
            <p className="text-sm text-muted-foreground mb-6">{result.cardsGenerated} cards generated</p>

            {/* Add More Cards section */}
            {showAddMore ? (
              <div className="max-w-xs mx-auto mb-6 p-4 rounded-2xl glass-card border border-border/50">
                <p className="text-sm font-medium text-foreground mb-3">How many more cards?</p>
                <div className="flex items-center justify-center gap-3 mb-3">
                  <button
                    onClick={() => setAddMoreCount(Math.max(1, addMoreCount - 5))}
                    className="h-9 w-9 rounded-lg border border-border hover:border-primary/30 hover:bg-primary/10 text-muted-foreground hover:text-primary flex items-center justify-center transition-all"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={addMoreCount}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      if (!isNaN(v)) setAddMoreCount(Math.max(1, Math.min(50, v)));
                    }}
                    className="w-16 h-9 text-center rounded-lg border border-border bg-background text-foreground text-lg font-bold focus:outline-none focus:ring-2 focus:ring-primary/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button
                    onClick={() => setAddMoreCount(Math.min(50, addMoreCount + 5))}
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
                    disabled={addingMore}
                    onClick={async () => {
                      setAddingMore(true);
                      try {
                        const { data, error: fnError } = await supabase.functions.invoke('generate-flashcards', {
                          body: { topicId: result.topicId, cardCount: addMoreCount },
                        });
                        if (fnError) throw fnError;
                        if (data?.error) throw new Error(data.error);
                        setResult({ ...result, cardsGenerated: result.cardsGenerated + (data.cardsGenerated || addMoreCount) });
                        setShowAddMore(false);
                        toast.success(`${data.cardsGenerated || addMoreCount} more flashcards added!`);
                      } catch (err: any) {
                        toast.error(err.message || 'Failed to generate more cards');
                      } finally {
                        setAddingMore(false);
                      }
                    }}
                  >
                    {addingMore ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                    Generate {addMoreCount}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowAddMore(false)} disabled={addingMore}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mb-6">
                <Button variant="outline" onClick={() => setShowAddMore(true)} className="mx-auto">
                  <Plus className="h-4 w-4 mr-2" /> Add More Cards
                </Button>
              </div>
            )}

            <div className="flex flex-col gap-3 max-w-xs mx-auto">
              <Button onClick={() => navigate(`/flashcards/${result.topicId}`)} variant="glow" className="h-12">
                <Sparkles className="h-4 w-4 mr-2" /> Study Flashcards
              </Button>
              <Button variant="outline" onClick={() => {
                setStep('input');
                setAnalysis(null);
                setResult(null);
                setExtractedContent('');
                setFileName('');
                setUrl('');
                setTextContent('');
                setScopeInstructions('');
                setError('');
                setShowAddMore(false);
                setAddMoreCount(10);
              }}>
                Start New
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}