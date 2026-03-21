import { useState } from 'react';
import { Download, FileText, Loader2, BookOpen, Library } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

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

interface Step {
  title: string;
  description: string;
  estimatedTime: string;
  completed: boolean;
  order: number;
}

interface LessonData {
  sections: { heading: string; content: string }[];
  keyTakeaways: string[];
}

interface NotionExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topicTitle: string;
  steps: Step[];
  progress: number;
  extraMaterials: Record<number, ExtraMaterials>;
  lessons: Record<number, LessonData>;
  stepIndex?: number | null; // null = full export, number = single step
}

function generateRoadmapMarkdown(
  topicTitle: string,
  steps: Step[],
  progress: number,
  lessons?: Record<number, LessonData>,
  extraMaterials?: Record<number, ExtraMaterials>,
  includeLessons?: boolean,
  includeMaterials?: boolean
): string {
  let md = `# 🗺️ Roadmap: ${topicTitle}\n\n`;
  md += `**Progress:** ${progress}%\n\n---\n\n`;

  const categoryConfig = [
    { key: 'videos' as const, emoji: '🎥', label: 'Videos' },
    { key: 'websites' as const, emoji: '🌐', label: 'Websites' },
    { key: 'books' as const, emoji: '📖', label: 'Books' },
    { key: 'apps' as const, emoji: '📱', label: 'Apps' },
    { key: 'other' as const, emoji: '📌', label: 'Other' },
  ];

  steps.forEach((step, i) => {
    const status = step.completed ? '✅' : '⬜';
    md += `## ${status} Step ${i + 1}: ${step.title}\n\n`;
    md += `${step.description}\n\n`;
    if (step.estimatedTime) {
      md += `⏱️ *Estimated time: ${step.estimatedTime}*\n\n`;
    }

    // Include lesson content inline
    if (includeLessons && lessons?.[i]) {
      const lesson = lessons[i];
      md += `### 📖 Lesson\n\n`;
      lesson.sections.forEach((section) => {
        md += `#### ${section.heading}\n\n${section.content}\n\n`;
      });
      if (lesson.keyTakeaways.length > 0) {
        md += `#### 🔑 Key Takeaways\n\n`;
        lesson.keyTakeaways.forEach((t) => {
          md += `- ${t}\n`;
        });
        md += `\n`;
      }
    }

    // Include materials inline
    if (includeMaterials && extraMaterials?.[i]) {
      const materials = extraMaterials[i];
      const hasContent = categoryConfig.some((c) => materials[c.key]?.length > 0);
      if (hasContent) {
        md += `### 📚 Extra Materials\n\n`;
        categoryConfig.forEach(({ key, emoji, label }) => {
          const items = materials[key];
          if (!items || items.length === 0) return;
          md += `#### ${emoji} ${label}\n\n`;
          items.forEach((item) => {
            md += `- **[${item.name}](${item.url})**\n`;
            if (item.description) md += `  ${item.description}\n`;
          });
          md += `\n`;
        });
      }
    }

    md += `---\n\n`;
  });

  return md;
}

function generateStepMarkdown(
  topicTitle: string,
  step: Step,
  stepIndex: number,
  lesson?: LessonData,
  materials?: ExtraMaterials
): string {
  let md = `# Step ${stepIndex + 1}: ${step.title}\n\n`;
  md += `*Part of: ${topicTitle}*\n\n`;
  md += `${step.description}\n\n`;
  if (step.estimatedTime) {
    md += `⏱️ *Estimated time: ${step.estimatedTime}*\n\n`;
  }

  if (lesson) {
    md += `---\n\n## 📖 Lesson\n\n`;
    lesson.sections.forEach((section) => {
      md += `### ${section.heading}\n\n${section.content}\n\n`;
    });
    if (lesson.keyTakeaways.length > 0) {
      md += `### 🔑 Key Takeaways\n\n`;
      lesson.keyTakeaways.forEach((t) => {
        md += `- ${t}\n`;
      });
      md += `\n`;
    }
  }

  if (materials) {
    const categoryConfig = [
      { key: 'videos' as const, emoji: '🎥', label: 'Videos' },
      { key: 'websites' as const, emoji: '🌐', label: 'Websites' },
      { key: 'books' as const, emoji: '📖', label: 'Books' },
      { key: 'apps' as const, emoji: '📱', label: 'Apps' },
      { key: 'other' as const, emoji: '📌', label: 'Other' },
    ];
    const hasContent = categoryConfig.some((c) => materials[c.key]?.length > 0);
    if (hasContent) {
      md += `---\n\n## 📚 Extra Materials\n\n`;
      categoryConfig.forEach(({ key, emoji, label }) => {
        const items = materials[key];
        if (!items || items.length === 0) return;
        md += `### ${emoji} ${label}\n\n`;
        items.forEach((item) => {
          md += `- **[${item.name}](${item.url})**\n`;
          if (item.description) md += `  ${item.description}\n`;
        });
        md += `\n`;
      });
    }
  }

  return md;
}

function generateExtraMaterialsMarkdown(
  topicTitle: string,
  steps: Step[],
  extraMaterials: Record<number, ExtraMaterials>
): string {
  let md = `# 📚 Extra Materials: ${topicTitle}\n\n`;

  const categoryConfig = [
    { key: 'videos' as const, emoji: '🎥', label: 'Videos' },
    { key: 'websites' as const, emoji: '🌐', label: 'Websites' },
    { key: 'books' as const, emoji: '📖', label: 'Books' },
    { key: 'apps' as const, emoji: '📱', label: 'Apps' },
    { key: 'other' as const, emoji: '📌', label: 'Other' },
  ];

  let hasAny = false;

  steps.forEach((step, i) => {
    const materials = extraMaterials[i];
    if (!materials) return;

    const hasContent = categoryConfig.some(
      (cat) => materials[cat.key] && materials[cat.key].length > 0
    );
    if (!hasContent) return;

    hasAny = true;
    md += `## Step ${i + 1}: ${step.title}\n\n`;

    categoryConfig.forEach(({ key, emoji, label }) => {
      const items = materials[key];
      if (!items || items.length === 0) return;

      md += `### ${emoji} ${label}\n\n`;
      items.forEach((item) => {
        md += `- **[${item.name}](${item.url})**\n`;
        if (item.description) {
          md += `  ${item.description}\n`;
        }
      });
      md += `\n`;
    });

    md += `---\n\n`;
  });

  if (!hasAny) {
    md += `*No extra materials have been loaded yet. Open "Extra Materials" for each step in the roadmap first, then export.*\n`;
  }

  return md;
}

function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function NotionExportDialog({
  open,
  onOpenChange,
  topicTitle,
  steps,
  progress,
  extraMaterials,
  lessons,
  stepIndex,
}: NotionExportDialogProps) {
  const [exportRoadmap, setExportRoadmap] = useState(true);
  const [exportMaterials, setExportMaterials] = useState(true);
  const [exportLesson, setExportLesson] = useState(true);
  const [exporting, setExporting] = useState(false);

  const isSingleStep = stepIndex != null;
  const materialsCount = Object.keys(extraMaterials).length;
  const hasMaterials = isSingleStep ? !!extraMaterials[stepIndex] : materialsCount > 0;
  const lessonsCount = Object.keys(lessons).length;
  const hasLessons = isSingleStep ? !!lessons[stepIndex] : lessonsCount > 0;
  const hasLesson = hasLessons;

  const handleExport = async () => {
    setExporting(true);
    try {
      const safeName = topicTitle.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '-');

      if (isSingleStep) {
        // Single step export — one file with lesson + materials
        const step = steps[stepIndex];
        const stepMd = generateStepMarkdown(
          topicTitle,
          step,
          stepIndex,
          exportLesson ? lessons[stepIndex] : undefined,
          exportMaterials ? extraMaterials[stepIndex] : undefined
        );
        downloadMarkdown(`Step-${stepIndex + 1}-${safeName}.md`, stepMd);
      } else {
        // Full detailed export — one comprehensive file
        const roadmapMd = generateRoadmapMarkdown(
          topicTitle,
          steps,
          progress,
          lessons,
          extraMaterials,
          exportLesson && hasLessons,
          exportMaterials && hasMaterials
        );
        downloadMarkdown(`Roadmap-${safeName}.md`, roadmapMd);
      }

      await new Promise((r) => setTimeout(r, 300));
      onOpenChange(false);
    } finally {
      setExporting(false);
    }
  };

  const stepTitle = isSingleStep ? steps[stepIndex]?.title : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            {isSingleStep ? `Export Step ${stepIndex + 1}` : 'Export for Notion'}
          </DialogTitle>
          <DialogDescription>
            {isSingleStep
              ? `Download "${stepTitle}" as a Markdown file for Notion.`
              : 'Download Markdown files formatted for Notion. Import them via Notion\'s "Import" feature to preserve full structure.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isSingleStep ? (
            <>
              {/* Lesson checkbox */}
              <label className="flex items-start gap-3 p-3 rounded-lg border border-border/50 hover:border-primary/30 transition-colors cursor-pointer">
                <Checkbox
                  checked={exportLesson}
                  onCheckedChange={(v) => setExportLesson(v === true)}
                  disabled={!hasLesson}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <BookOpen className="h-4 w-4 text-primary" />
                    Lesson Content
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {hasLesson
                      ? 'Include lesson sections and key takeaways'
                      : 'No lesson loaded — expand this step first'}
                  </p>
                </div>
              </label>

              {/* Materials checkbox */}
              <label className="flex items-start gap-3 p-3 rounded-lg border border-border/50 hover:border-primary/30 transition-colors cursor-pointer">
                <Checkbox
                  checked={exportMaterials}
                  onCheckedChange={(v) => setExportMaterials(v === true)}
                  disabled={!hasMaterials}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <Library className="h-4 w-4 text-primary" />
                    Extra Materials
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {hasMaterials
                      ? 'Include curated resources (videos, websites, books...)'
                      : 'No materials loaded — click "Extra Materials" first'}
                  </p>
                </div>
              </label>
            </>
          ) : (
            <>
              {/* Lessons checkbox */}
              <label className="flex items-start gap-3 p-3 rounded-lg border border-border/50 hover:border-primary/30 transition-colors cursor-pointer">
                <Checkbox
                  checked={exportLesson}
                  onCheckedChange={(v) => setExportLesson(v === true)}
                  disabled={!hasLessons}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <BookOpen className="h-4 w-4 text-primary" />
                    Lesson Content
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {hasLessons
                      ? `Lessons loaded for ${lessonsCount} of ${steps.length} steps`
                      : 'No lessons loaded — expand steps first to generate lessons'}
                  </p>
                </div>
              </label>

              {/* Full Materials checkbox */}
              <label className="flex items-start gap-3 p-3 rounded-lg border border-border/50 hover:border-primary/30 transition-colors cursor-pointer">
                <Checkbox
                  checked={exportMaterials}
                  onCheckedChange={(v) => setExportMaterials(v === true)}
                  disabled={!hasMaterials}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <Library className="h-4 w-4 text-primary" />
                    Extra Materials
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {hasMaterials
                      ? `Resources loaded for ${materialsCount} of ${steps.length} steps`
                      : 'No materials loaded yet — open "Extra Materials" per step first'}
                  </p>
                </div>
              </label>
            </>
          )}

          {/* Info note */}
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
            <FileText className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              In Notion: click <strong>···</strong> → <strong>Import</strong> → select the downloaded
              <strong> .md</strong> file. Structure, headings, and links will be preserved.
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={exporting || (isSingleStep ? (!exportLesson && !exportMaterials) : false)}
            size="sm"
            variant="glow"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            {isSingleStep ? 'Download Step' : 'Download Detailed Roadmap'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
