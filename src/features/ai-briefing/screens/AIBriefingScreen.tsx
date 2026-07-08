"use client";

import { AlertTriangle, BookOpen, Flag, Mic, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppCommands, useRegisterPages } from "@/features/desktop/core/menu/app-commands";
import { useWindowId } from "@/features/desktop/core/menu/window-context";
import { useAI } from "@/platform/ai/provider";
import { EmptyDatasetState } from "../components/EmptyDatasetState";
import { ModelStatusBar } from "../components/ModelStatusBar";
import { useBriefingContext } from "../hooks/useBriefingContext";

// Code-split each heavy tab body; only the active tab's chunk loads, and the
// provider/LLM chunk is pulled in lazily on first generate inside the tab.
const TabFallback = () => (
  <div className="space-y-3">
    <Skeleton className="h-10 w-48" />
    <Skeleton className="h-40 w-full" />
  </div>
);

const DailyBriefingTab = dynamic(() => import("../components/DailyBriefingTab"), {
  ssr: false,
  loading: TabFallback,
});
const AnomalyReportTab = dynamic(() => import("../components/AnomalyReportTab"), {
  ssr: false,
  loading: TabFallback,
});
const ActionPlanTab = dynamic(() => import("../components/ActionPlanTab"), {
  ssr: false,
  loading: TabFallback,
});
const DataStoryTab = dynamic(() => import("../components/DataStoryTab"), {
  ssr: false,
  loading: TabFallback,
});

const BRIEFING_PAGES = [
  { id: "briefing", label: "Briefing quotidien" },
  { id: "anomaly", label: "Rapport d'anomalies" },
  { id: "action", label: "Plan d'action" },
  { id: "story", label: "Récit des données" },
] as const;

export default function AIBriefingScreen() {
  const { context, loading, error, datasetName, reload } = useBriefingContext();
  const ai = useAI();
  const windowId = useWindowId();
  const [activeTab, setActiveTab] = useState<string>("briefing");

  const warmUp = useCallback(() => {
    void ai.ensureReady().catch(() => {});
  }, [ai]);

  // Let the desktop menu drive the screen: page navigation, data refresh,
  // and a one-shot model warm-up all map onto existing handlers.
  useRegisterPages(windowId, [...BRIEFING_PAGES], activeTab);
  useAppCommands("ai-briefing", {
    refresh: () => reload(),
    warm: () => warmUp(),
    navigate: (payload) => {
      const pageId = (payload as { pageId?: string } | undefined)?.pageId;
      if (pageId) setActiveTab(pageId);
    },
  });

  const ready = Boolean(context) && !loading && !error;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-1"
        >
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl border border-primary/20 bg-gradient-to-br from-primary/20 to-violet-500/20">
              <Sparkles className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">AI Intelligence Suite</h1>
              <p className="text-sm text-muted-foreground">
                {datasetName
                  ? `On-device briefings for "${datasetName}"`
                  : "Auto-generated narrative briefings from your data"}
              </p>
            </div>
          </div>
        </motion.div>

        <ModelStatusBar onWarm={warmUp} />

        {!ready || !context ? (
          <EmptyDatasetState loading={loading} error={error} onRetry={reload} />
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="briefing" className="gap-1.5">
                <Mic className="size-3.5" />
                <span className="hidden sm:inline">Daily Briefing</span>
                <span className="sm:hidden">Briefing</span>
              </TabsTrigger>
              <TabsTrigger value="anomaly" className="gap-1.5">
                <AlertTriangle className="size-3.5" />
                <span className="hidden sm:inline">Anomaly Report</span>
                <span className="sm:hidden">Anomaly</span>
              </TabsTrigger>
              <TabsTrigger value="action" className="gap-1.5">
                <Flag className="size-3.5" />
                <span className="hidden sm:inline">Action Plan</span>
                <span className="sm:hidden">Actions</span>
              </TabsTrigger>
              <TabsTrigger value="story" className="gap-1.5">
                <BookOpen className="size-3.5" />
                <span className="hidden sm:inline">Data Story</span>
                <span className="sm:hidden">Story</span>
              </TabsTrigger>
            </TabsList>

            {/* `context` is narrowed non-null by the `!context` guard above. */}
            <TabsContent value="briefing" className="mt-6">
              <DailyBriefingTab context={context} />
            </TabsContent>
            <TabsContent value="anomaly" className="mt-6">
              <AnomalyReportTab context={context} />
            </TabsContent>
            <TabsContent value="action" className="mt-6">
              <ActionPlanTab context={context} />
            </TabsContent>
            <TabsContent value="story" className="mt-6">
              <DataStoryTab context={context} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
