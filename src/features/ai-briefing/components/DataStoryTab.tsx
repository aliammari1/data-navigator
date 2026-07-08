"use client";

import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  RefreshCw,
  Share2,
  Star,
  TrendingDown,
  Wand2,
} from "lucide-react";
import { motion } from "motion/react";
import { memo, useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAI } from "@/platform/ai/provider";
import { cn } from "@/shared/utils";
import type { BriefingContext } from "../core/briefing-context";
import { buildDataStoryPrompt } from "../core/briefing-prompts";
import { DataStorySchema } from "../core/briefing-schemas";
import { useBriefingStore } from "../store/briefing-store";

interface StoryAct {
  title: string;
  subtitle: string;
  text: string;
  icon: typeof BookOpen;
  color: string;
}

const ACT_META = [
  {
    title: "Act I",
    subtitle: "The Setup",
    icon: BookOpen,
    color: "text-blue-400 border-blue-500/30 bg-blue-500/5",
  },
  {
    title: "Act II",
    subtitle: "The Conflict",
    icon: AlertTriangle,
    color: "text-orange-400 border-orange-500/30 bg-orange-500/5",
  },
  {
    title: "Act III",
    subtitle: "The Resolution",
    icon: CheckCircle2,
    color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/5",
  },
] as const;

const StoryActCard = memo(function StoryActCard({ act, index }: { act: StoryAct; index: number }) {
  const Icon = act.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 3) * 0.08 }}
      className={cn("rounded-lg border p-5", act.color)}
    >
      <div className="mb-3 flex items-center gap-2">
        <Icon className="size-4" />
        <span className="text-sm font-bold">{act.title}</span>
        <span className="text-xs text-muted-foreground">— {act.subtitle}</span>
      </div>
      <p className="text-sm leading-relaxed">{act.text}</p>
    </motion.div>
  );
});

export default function DataStoryTab({ context }: { context: BriefingContext }) {
  const [acts, setActs] = useState<StoryAct[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const ai = useAI();
  const { saveBriefing } = useBriefingStore();

  // Real "hero / villain" derived from the top categorical breakdown, if any.
  const { hero, villain } = useMemo(() => {
    const values = context.topCategory?.values ?? [];
    if (values.length === 0) return { hero: null, villain: null };
    return { hero: values[0], villain: values[values.length - 1] };
  }, [context.topCategory]);

  const generateStory = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const { system, prompt } = buildDataStoryPrompt(context);
      const story = await ai.generateStructured(
        { system, prompt, maxTokens: 900, temperature: 0.75 },
        DataStorySchema,
      );
      const next: StoryAct[] = [
        { ...ACT_META[0], text: story.setup },
        { ...ACT_META[1], text: story.conflict },
        { ...ACT_META[2], text: story.resolution },
      ];
      setActs(next);
      const fullStory = next
        .map((a) => `${a.title}: ${a.subtitle}\n\n${a.text}`)
        .join("\n\n---\n\n");
      saveBriefing(fullStory, "story");
    } catch (err) {
      setError(
        err instanceof Error
          ? "The model did not return a valid story. Please try again."
          : "Story generation failed.",
      );
    } finally {
      setGenerating(false);
    }
  }, [context, ai, saveBriefing]);

  const shareStory = useCallback(async () => {
    if (acts.length === 0) return;
    const text = [
      `DATA STORY — ${context.datasetName}`,
      "",
      ...acts.map((a) => `${a.title}: ${a.subtitle}\n\n${a.text}`),
    ].join("\n\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [acts, context.datasetName]);

  return (
    <div className="space-y-6">
      <Card className="border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 to-background">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="size-5 text-cyan-400" />
            Data Story Generator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Button onClick={generateStory} disabled={generating}>
              {generating ? (
                <>
                  <RefreshCw className="size-4 animate-spin" />
                  Writing Story…
                </>
              ) : (
                <>
                  <Wand2 className="size-4" />
                  Generate Story
                </>
              )}
            </Button>
            {acts.length > 0 && !generating && (
              <Button variant="outline" onClick={shareStory}>
                <Share2 className="size-4" />
                {copied ? "Copied!" : "Share Story"}
              </Button>
            )}
          </div>

          {error && <p className="text-sm text-red-300">{error}</p>}

          {/* Hero & Villain (real top/bottom category, only when available) */}
          {hero && villain && context.topCategory && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Star className="size-4 fill-amber-400 text-amber-400" />
                  <span className="text-xs font-medium text-amber-300">
                    TOP {context.topCategory.dimension.toUpperCase()}
                  </span>
                </div>
                <div className="text-sm font-bold">{hero.label}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {hero.pct.toFixed(1)}% of rows · {hero.count.toLocaleString()} records
                </div>
              </div>
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <TrendingDown className="size-4 text-red-400" />
                  <span className="text-xs font-medium text-red-300">
                    LOWEST OF TOP {context.topCategory.dimension.toUpperCase()}
                  </span>
                </div>
                <div className="text-sm font-bold">{villain.label}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {villain.pct.toFixed(1)}% of rows · {villain.count.toLocaleString()} records
                </div>
              </div>
            </div>
          )}

          {generating && (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="space-y-2 rounded-lg border p-4">
                  <Skeleton className="h-4 w-1/4" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-5/6" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              ))}
            </div>
          )}

          {!generating && acts.length > 0 && (
            <div className="space-y-4">
              {acts.map((act, idx) => (
                <StoryActCard key={act.title} act={act} index={idx} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
