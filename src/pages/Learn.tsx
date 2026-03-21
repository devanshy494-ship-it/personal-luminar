import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Brain, ArrowLeft, Loader2, Sparkles, Plus, Upload, Link, FileText, Youtube, X, Check, AlertCircle, GitBranch, SlidersHorizontal, ChevronDown, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

const VISIT_COUNT_KEY = 'luminar_learn_visit_count';
const SUGGESTIONS_CACHE_KEY = 'luminar_personalized_suggestions';
const SUGGESTIONS_VISIT_KEY = 'luminar_suggestions_fetch_visit';

const defaultSuggestions = [
  'Machine Learning Fundamentals',
  'JavaScript for Beginners',
  'Quantum Physics',
  'UX Design Principles',
  'Financial Investing',
  'World History',
];

type SourceType = 'file' | 'url' | 'text';

interface Suggestion {
  topic: string;
  category: 'based_on_history' | 'random' | 'tangential';
}

function isYouTubeUrl(urlStr: string) {
  return /(?:youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)/.test(urlStr);
}

async function extractTextFromFile(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'txt' || ext === 'md' || ext === 'csv' || ext === 'json' || ext === 'xml') {
    return file.text();
  }

  if (ext === 'pdf') {
    const pdfjsLib = (window as any).pdfjsLib;
    if (!pdfjsLib) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load PDF library'));
        document.head.appendChild(script);
      });
    }
    const lib = (window as any).pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await lib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item: any) => item.str).join(' ') + '\n';
    }
    return text;
  }

  if (ext === 'docx') {
    const mammoth = await import('mammoth');
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }

  return await file.text();
}

export default function Learn() {
  const { user, guestUser } = useAuth();
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [strictMode, setStrictMode] = useState(false);
  const [loadingMindmap, setLoadingMindmap] = useState(false);
  const [showSourcePanel, setShowSourcePanel] = useState(false);
  const [sourceType, setSourceType] = useState<SourceType>('file');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [fileName, setFileName] = useState('');
  const [extractedContent, setExtractedContent] = useState('');
  const [sourceError, setSourceError] = useState('');
  const [loadingSource, setLoadingSource] = useState(false);
  const [additionalInfo, setAdditionalInfo] = useState('');
  const [showAdditionalInfo, setShowAdditionalInfo] = useState(false);
  const [pendingGenType, setPendingGenType] = useState<'roadmap' | 'mindmap' | null>(null);
  const [smartSuggestions, setSmartSuggestions] = useState<string[]>(defaultSuggestions);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Track visits and fetch personalized suggestions every 7 visits
  useEffect(() => {
    if (guestUser) return; // Guest users get default suggestions

    const visitCount = parseInt(localStorage.getItem(VISIT_COUNT_KEY) || '0', 10) + 1;
    localStorage.setItem(VISIT_COUNT_KEY, String(visitCount));

    const lastFetchVisit = parseInt(localStorage.getItem(SUGGESTIONS_VISIT_KEY) || '0', 10);
    const cached = localStorage.getItem(SUGGESTIONS_CACHE_KEY);

    // Load cached suggestions if available
    if (cached) {
      try {
        setSmartSuggestions(JSON.parse(cached));
      } catch { /* use defaults */ }
    }

    // Fetch new suggestions every 7 visits
    if (visitCount - lastFetchVisit >= 7 && user) {
      fetchPersonalizedSuggestions(visitCount);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchPersonalizedSuggestions = async (currentVisit: number) => {
    setLoadingSuggestions(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-suggestions');
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const topics = (data.suggestions as Suggestion[]).map(s => s.topic);
      if (topics.length === 6) {
        setSmartSuggestions(topics);
        localStorage.setItem(SUGGESTIONS_CACHE_KEY, JSON.stringify(topics));
        localStorage.setItem(SUGGESTIONS_VISIT_KEY, String(currentVisit));
      }
    } catch (e) {
      console.error('Failed to fetch personalized suggestions:', e);
      // Silently fall back to cached or default suggestions
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const hasSource = !!extractedContent;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setSourceError('File must be under 20MB');
      return;
    }
    setSourceError('');
    setFileName(file.name);
    setLoadingSource(true);
    try {
      const text = await extractTextFromFile(file);
      if (text.trim().length < 50) {
        setSourceError('Extracted text is too short.');
        setLoadingSource(false);
        return;
      }
      setExtractedContent(text);
      if (!topic) setTopic(file.name.replace(/\.[^.]+$/, ''));
    } catch (err: any) {
      setSourceError(err.message || 'Failed to read file');
    } finally {
      setLoadingSource(false);
    }
  };

  const handleUrlSource = async () => {
    if (!sourceUrl.trim()) return;
    setSourceError('');
    setLoadingSource(true);
    const trimmed = sourceUrl.trim();
    // Basic URL validation
    const urlPattern = /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i;
    if (!urlPattern.test(trimmed)) {
      setSourceError('Please enter a valid URL (e.g. https://example.com)');
      setLoadingSource(false);
      return;
    }
    const cleanUrl = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;

    try {
      if (isYouTubeUrl(cleanUrl)) {
        try {
          const videoIdMatch = cleanUrl.match(/(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
          if (videoIdMatch) {
            const oembedRes = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoIdMatch[1]}`);
            const oembedData = await oembedRes.json();
            if (oembedData.title && !topic) setTopic(oembedData.title);
          }
        } catch { /* ignore title fetch errors */ }
        setExtractedContent(`[YouTube video: ${cleanUrl}]`);
      } else {
        const { data, error } = await supabase.functions.invoke('analyze-document', {
          body: { url: cleanUrl },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        setExtractedContent(`[URL content analyzed: ${cleanUrl}]`);
        if (!topic && data.analysis?.title) setTopic(data.analysis.title);
      }
    } catch (err: any) {
      setSourceError(err.message || 'Failed to fetch URL');
    } finally {
      setLoadingSource(false);
    }
  };


  const handleTextSource = () => {
    if (sourceText.trim().length < 50) {
      setSourceError('Please enter at least 50 characters');
      return;
    }
    setExtractedContent(sourceText.trim());
    setSourceError('');
  };

  const clearSource = () => {
    setExtractedContent('');
    setFileName('');
    setSourceUrl('');
    setSourceText('');
    setSourceError('');
  };

  const handleGenerateMindmap = async (topicText: string) => {
    const trimmed = topicText.trim();
    if (!trimmed) {
      toast.error('Please enter a topic');
      return;
    }

    setLoadingMindmap(true);
    try {
      const body: any = { topic: trimmed };
      if (extractedContent && extractedContent.length > 50) {
        body.sourceContent = extractedContent.slice(0, 15000);
        body.strictMode = strictMode;
      }

      const { data, error } = await supabase.functions.invoke('generate-mindmap', { body });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }

      toast.success('Mindmap generated!');
      navigate(`/mindmap/${data.mindmapId}`, { state: { mindmap: data.mindmap, fromTopic: trimmed } });
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to generate mindmap');
    } finally {
      setLoadingMindmap(false);
    }
  };

  const handleGenerate = async (topicText: string) => {
    const trimmed = topicText.trim();
    if (!trimmed) {
      toast.error('Please enter a topic');
      return;
    }

    setLoading(true);
    try {
      const body: any = { topic: trimmed };
      if (extractedContent && extractedContent.length > 50) {
        body.sourceContent = extractedContent.slice(0, 15000);
        body.strictMode = strictMode;
      }
      if (additionalInfo.trim()) {
        body.additionalInfo = additionalInfo.trim();
      }

      const { data, error } = await supabase.functions.invoke('generate-roadmap', {
        body,
      });

      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }

      toast.success('Roadmap generated!');
      navigate(`/roadmap/${data.topicId}`);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to generate roadmap');
    } finally {
      setLoading(false);
    }
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
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Dashboard
          </Button>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-16 max-w-2xl relative z-10">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6 border border-primary/20">
            <Brain className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3 font-heading">
            What do you want to <span className="gradient-text">learn</span>?
          </h1>
          <p className="text-muted-foreground text-lg">
            Enter a topic or add source material (PDF, URL, YouTube) for a customized roadmap.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          {/* Topic input with + button */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (hasSource) {
                setPendingGenType('roadmap');
              } else {
                handleGenerate(topic);
              }
            }}
            className="flex gap-3 mb-4"
          >
            <div className="relative flex-1">
              <button
                type="button"
                onClick={() => setShowSourcePanel(!showSourcePanel)}
                className={`absolute left-3 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg flex items-center justify-center transition-all z-10 ${
                  showSourcePanel || hasSource
                    ? 'gradient-primary text-primary-foreground neon-glow-sm'
                    : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary'
                }`}
                title="Add source material"
              >
                {hasSource ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              </button>
              <Input
                placeholder="e.g. Machine Learning, Ancient Rome, Guitar..."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="text-base py-6 pl-14 focus:border-primary/50 focus:ring-primary/30"
                disabled={loading || loadingMindmap}
                maxLength={200}
              />
            </div>
            <Button type="submit" size="lg" variant="glow" className="px-6 py-6" disabled={loading || loadingMindmap} title="Generate Roadmap">
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Sparkles className="h-5 w-5" />
              )}
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="px-6 py-6"
              disabled={loading || loadingMindmap || !topic.trim()}
              onClick={() => {
                if (hasSource) {
                  setPendingGenType('mindmap');
                } else {
                  handleGenerateMindmap(topic);
                }
              }}
              title="Generate Mindmap"
            >
              {loadingMindmap ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <GitBranch className="h-5 w-5" />
              )}
            </Button>
          </form>

          {/* Source badge */}
          {hasSource && !showSourcePanel && !pendingGenType && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mb-4"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/10 text-secondary text-sm border border-secondary/20">
                {fileName ? <FileText className="h-3.5 w-3.5" /> : sourceUrl && isYouTubeUrl(sourceUrl) ? <Youtube className="h-3.5 w-3.5" /> : sourceUrl ? <Link className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                <span className="font-medium">
                  {fileName || (sourceUrl ? (sourceUrl.length > 40 ? sourceUrl.slice(0, 40) + '...' : sourceUrl) : 'Text source attached')}
                </span>
                <span className="text-xs text-muted-foreground">({Math.round(extractedContent.length / 1000)}k chars)</span>
                <button onClick={clearSource} className="hover:text-destructive transition-colors">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </motion.div>
          )}

          {/* Mode selection panel — shown when user clicks roadmap/mindmap with source */}
          <AnimatePresence>
            {pendingGenType && hasSource && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 overflow-hidden"
              >
                <div className="p-4 rounded-2xl glass-card border border-border/50">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-foreground">
                      How should AI use your source material?
                    </p>
                    <button onClick={() => setPendingGenType(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-3 mb-4">
                    <button
                      onClick={() => setStrictMode(false)}
                      className={`flex-1 py-3 px-3 rounded-xl text-sm font-medium transition-all ${
                        !strictMode
                          ? 'bg-primary/10 text-primary border-2 border-primary/30'
                          : 'text-muted-foreground hover:text-foreground border-2 border-border hover:border-primary/20'
                      }`}
                    >
                      🌐 Contextual
                      <span className="block text-xs font-normal mt-0.5 opacity-70">AI supplements gaps</span>
                    </button>
                    <button
                      onClick={() => setStrictMode(true)}
                      className={`flex-1 py-3 px-3 rounded-xl text-sm font-medium transition-all ${
                        strictMode
                          ? 'bg-primary/10 text-primary border-2 border-primary/30'
                          : 'text-muted-foreground hover:text-foreground border-2 border-border hover:border-primary/20'
                      }`}
                    >
                      📄 Strict
                      <span className="block text-xs font-normal mt-0.5 opacity-70">Only from your material</span>
                    </button>
                  </div>
                  <Button
                    className="w-full"
                    variant="glow"
                    disabled={loading || loadingMindmap}
                    onClick={() => {
                      if (pendingGenType === 'roadmap') {
                        handleGenerate(topic);
                      } else {
                        handleGenerateMindmap(topic);
                      }
                      setPendingGenType(null);
                    }}
                  >
                    {(loading || loadingMindmap) ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : pendingGenType === 'roadmap' ? (
                      <Sparkles className="h-4 w-4 mr-2" />
                    ) : (
                      <GitBranch className="h-4 w-4 mr-2" />
                    )}
                    Generate {pendingGenType === 'roadmap' ? 'Roadmap' : 'Mindmap'}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Source panel */}
          <AnimatePresence>
            {showSourcePanel && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden mb-6"
              >
                <div className="p-5 rounded-2xl glass-card border border-border/50">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-heading font-semibold text-foreground">Add Source Material</h3>
                    <button onClick={() => setShowSourcePanel(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Source type tabs */}
                  <div className="flex gap-2 mb-4">
                    {[
                      { type: 'file' as SourceType, icon: Upload, label: 'File' },
                      { type: 'url' as SourceType, icon: Link, label: 'URL / YouTube' },
                      { type: 'text' as SourceType, icon: FileText, label: 'Text' },
                    ].map(({ type, icon: Icon, label }) => (
                      <button
                        key={type}
                        onClick={() => { setSourceType(type); setSourceError(''); }}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 transition-all text-sm font-medium ${
                          sourceType === type
                            ? 'border-primary bg-primary/5 text-primary animate-neon-border'
                            : 'border-border bg-background text-muted-foreground hover:border-primary/30'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Source inputs */}
                  {sourceType === 'file' && (
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
                        className="w-full p-6 rounded-xl border-2 border-dashed border-border hover:border-primary/40 bg-background/50 hover:bg-primary/5 transition-all text-center"
                      >
                        {loadingSource ? (
                          <Loader2 className="h-6 w-6 text-primary animate-spin mx-auto mb-2" />
                        ) : (
                          <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                        )}
                        <p className="text-foreground font-medium text-sm">{fileName || 'Click to upload'}</p>
                        <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, TXT, MD · Max 20MB</p>
                      </button>
                      {fileName && extractedContent && (
                        <p className="text-sm text-success mt-2 flex items-center gap-1">
                          <Check className="h-4 w-4" /> Loaded: {fileName}
                        </p>
                      )}
                    </div>
                  )}

                  {sourceType === 'url' && (
                    <div>
                      <div className="flex gap-2">
                        <Input
                          type="url"
                          placeholder="https://example.com or YouTube URL"
                          value={sourceUrl}
                          onChange={(e) => setSourceUrl(e.target.value)}
                          className="flex-1"
                        />
                        <Button onClick={handleUrlSource} disabled={loadingSource || !sourceUrl.trim()} size="sm">
                          {loadingSource ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Fetch'}
                        </Button>
                      </div>
                      {sourceUrl && isYouTubeUrl(sourceUrl) && !extractedContent && (
                        <p className="text-sm text-secondary mt-2 flex items-center gap-1">
                          <Youtube className="h-4 w-4" /> YouTube detected — AI will generate content from the video topic
                        </p>
                      )}
                      {extractedContent && sourceUrl && (
                        <p className="text-sm text-success mt-2 flex items-center gap-1">
                          <Check className="h-4 w-4" /> Content fetched successfully
                        </p>
                      )}
                    </div>
                  )}

                  {sourceType === 'text' && (
                    <div>
                      <Textarea
                        placeholder="Paste your study notes, article content, etc..."
                        value={sourceText}
                        onChange={(e) => setSourceText(e.target.value)}
                        rows={5}
                        className="resize-none mb-2"
                      />
                      <Button onClick={handleTextSource} disabled={sourceText.trim().length < 50} size="sm" variant="outline">
                        <Check className="h-3.5 w-3.5 mr-1" /> Attach Text
                      </Button>
                      {extractedContent && sourceType === 'text' && (
                        <p className="text-sm text-success mt-2 flex items-center gap-1">
                          <Check className="h-4 w-4" /> Text attached
                        </p>
                      )}
                    </div>
                  )}

                  {sourceError && (
                    <p className="text-sm text-destructive mt-3 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" /> {sourceError}
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Additional Information for Roadmap */}
          <div className="mb-6">
            <button
              onClick={() => setShowAdditionalInfo(!showAdditionalInfo)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span>Additional Instructions</span>
              {additionalInfo.trim() && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">Added</span>
              )}
              <ChevronDown className={`h-3 w-3 transition-transform ${showAdditionalInfo ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
              {showAdditionalInfo && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 p-4 rounded-2xl glass-card border border-border/50">
                    <p className="text-xs text-muted-foreground mb-2">
                      Specify what to include, exclude, focus on, or any scope details for the roadmap.
                    </p>
                    <Textarea
                      placeholder="e.g. Focus only on frontend technologies, exclude backend. Include React and TypeScript but not Angular. Keep it beginner-friendly..."
                      value={additionalInfo}
                      onChange={(e) => setAdditionalInfo(e.target.value)}
                      rows={3}
                      className="resize-none text-sm"
                      maxLength={1000}
                    />
                    {additionalInfo.trim() && (
                      <div className="flex justify-end mt-2">
                        <button
                          onClick={() => setAdditionalInfo('')}
                          className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {loading && (
            <motion.div
              className="text-center py-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <Loader2 className="h-10 w-10 text-primary animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground text-lg">Generating your learning roadmap...</p>
              <p className="text-muted-foreground text-sm mt-1">This may take a few seconds</p>
            </motion.div>
          )}

          {!loading && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <p className="text-sm text-muted-foreground">Or try one of these:</p>
                {loadingSuggestions && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              </div>
              <div className="flex flex-wrap gap-2">
                {smartSuggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setTopic(s);
                      handleGenerate(s);
                    }}
                    className="px-4 py-2 rounded-full glass-card border border-border/50 text-sm text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}