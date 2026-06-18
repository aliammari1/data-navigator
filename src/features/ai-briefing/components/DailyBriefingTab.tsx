"use client";

import {
  Clipboard,
  Download,
  FileText,
  Mic,
  RefreshCw,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  Wand2,
} from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildBarOption, OffscreenChart } from "@/platform/viz";
import { cn } from "@/shared/utils";
import type { BriefingContext, HistogramBin } from "../core/briefing-context";
import { fetchColumnHistogram } from "../core/briefing-context";
import { exportBriefingReport } from "../core/briefing-export";
import { buildDailyBriefingPrompt, buildExecutiveSummaryPrompt } from "../core/briefing-prompts";
import { useNarrator } from "../hooks/useNarrator";
import { useStreamingGeneration } from "../hooks/useStreamingGeneration";
import { useBriefingStore } from "../store/briefing-store";
import { SpeakingAnimation } from "./SpeakingAnimation";
import { StreamedProse } from "./StreamedProse";

function formatDateTime(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Math.abs(n) >= 1000 ? Math.round(n).toLocaleString() : Number(n.toFixed(2)).toString();
}

export default function DailyBriefingTab({ context }: { context: BriefingContext }) {
  const { lastBriefing, saveBriefing } = useBriefingStore();
  const briefingGen = useStreamingGeneration();
  const summaryGen = useStreamingGeneration();

  const [briefingText, setBriefingText] = useState<string>(
    lastBriefing?.type === "briefing" ? lastBriefing.text : "",
  );
  const [briefingDate, setBriefingDate] = useState<string>(
    lastBriefing?.type === "briefing" ? lastBriefing.generatedAt : "",
  );
  const [summaryText, setSummaryText] = useState("");
  const [summaryDate, setSummaryDate] = useState("");
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState<null | "pdf" | "docx">(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [histogram, setHistogram] = useState<HistogramBin[]>([]);

  // Offline neural narration (Kokoro worker) with a speechSynthesis fallback.
  const narrator = useNarrator();
  const speaking = narrator.speaking;

  // Real distribution of the first numeric column, computed in DuckDB. Used to
  // embed a real chart PNG in the exported report (never a fabricated series).
  const histoColumn = context.numericCols[0]?.name ?? null;
  useEffect(() => {
    let cancelled = false;
    if (!histoColumn) {
      setHistogram([]);
      return;
    }
    void fetchColumnHistogram(context.tableName, histoColumn, 24).then((bins) => {
      if (!cancelled) setHistogram(bins);
    });
    return () => {
      cancelled = true;
    };
  }, [context.tableName, histoColumn]);

  // Live stream wins while generating; otherwise the persisted/last result.
  const displayedBriefing = briefingGen.busy ? briefingGen.text : briefingText;
  const displayedSummary = summaryGen.busy ? summaryGen.text : summaryText;

  const generateBriefing = useCallback(async () => {
    const { system, prompt } = buildDailyBriefingPrompt(context);
    try {
      const text = await briefingGen.run(system, prompt, { maxTokens: 700, temperature: 0.6 });
      setBriefingText(text);
      setBriefingDate(new Date().toISOString());
      if (text.trim()) saveBriefing(text, "briefing");
    } catch {
      /* error surfaced via briefingGen.error */
    }
  }, [context, briefingGen, saveBriefing]);

  const generateSummary = useCallback(async () => {
    const { system, prompt } = buildExecutiveSummaryPrompt(context);
    try {
      const text = await summaryGen.run(system, prompt, { maxTokens: 700, temperature: 0.45 });
      setSummaryText(text);
      setSummaryDate(new Date().toISOString());
    } catch {
      /* error surfaced via summaryGen.error */
    }
  }, [context, summaryGen]);

  const readAloud = useCallback(() => {
    if (!briefingText) return;
    void narrator.speak(briefingText);
  }, [briefingText, narrator]);

  const stopSpeaking = useCallback(() => {
    narrator.stop();
  }, [narrator]);

  const metricCards = useMemo(() => {
    const cards: { label: string; value: string }[] = [
      { label: "Rows", value: context.rowCount.toLocaleString() },
      { label: "Numeric columns", value: String(context.numericCols.length) },
    ];
    for (const col of context.numericCols.slice(0, 2)) {
      cards.push({ label: `${col.name} (avg)`, value: fmtNum(col.mean) });
    }
    if (context.topCategory && cards.length < 4) {
      cards.push({
        label: `Top ${context.topCategory.dimension}`,
        value: context.topCategory.values[0]?.label ?? "—",
      });
    }
    return cards.slice(0, 4);
  }, [context]);

  const histogramOption = useMemo(() => {
    if (histogram.length === 0 || !histoColumn) return null;
    return buildBarOption(
      histogram.map((b) => b.label),
      [{ name: "Count", data: histogram.map((b) => b.count), color: "#6366f1" }],
      { title: `${histoColumn} distribution` },
    );
  }, [histogram, histoColumn]);

  const buildSummaryExport = useCallback(() => {
    return [
      "EXECUTIVE SUMMARY — FOR MANAGEMENT",
      `Dataset: ${context.datasetName} | Generated: ${formatDateTime(summaryDate)}`,
      `Rows: ${context.rowCount.toLocaleString()}`,
      "",
      summaryText,
    ].join("\n");
  }, [context, summaryDate, summaryText]);

  const copyToClipboard = useCallback(async () => {
    await navigator.clipboard.writeText(buildSummaryExport());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [buildSummaryExport]);

  const downloadTxt = useCallback(() => {
    const blob = new Blob([buildSummaryExport()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `executive-summary-${context.datasetName}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [buildSummaryExport, context.datasetName]);

  const exportReport = useCallback(
    async (kind: "pdf" | "docx") => {
      setExporting(kind);
      setExportError(null);
      try {
        await exportBriefingReport({
          context,
          kind,
          title: "Executive Briefing",
          fileBase: "executive-briefing",
          narrative: [
            { label: "Daily Briefing", text: displayedBriefing },
            { label: "Executive Summary", text: summaryText },
          ],
          histogram: histoColumn
            ? { bins: histogram, title: `${histoColumn} distribution` }
            : undefined,
        });
      } catch (err) {
        setExportError(err instanceof Error ? err.message : "Export failed. Please try again.");
      } finally {
        setExporting(null);
      }
    },
    [context, displayedBriefing, summaryText, histogram, histoColumn],
  );

  const canExport = Boolean(summaryText || briefingText);

  const canReadAloud = narrator.available && Boolean(briefingText);

  return (
    <div className="space-y-6">
      {/* ── Voice Briefing ── */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-background">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mic className="size-5 text-primary" />
            AI Voice Briefing
            {speaking && <SpeakingAnimation />}
            {(speaking || narrator.loading) && (
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {narrator.engine}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={generateBriefing} disabled={briefingGen.busy}>
              {briefingGen.busy ? (
                <>
                  <RefreshCw className="size-4 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  {briefingText ? "Regenerate" : "Generate Briefing"}
                </>
              )}
            </Button>
            {briefingGen.busy && (
              <Button variant="outline" onClick={briefingGen.cancel}>
                <Square className="size-4" />
                Stop
              </Button>
            )}
            {canReadAloud && !speaking && !briefingGen.busy && (
              <Button variant="outline" onClick={readAloud} disabled={narrator.loading}>
                {narrator.loading ? (
                  <>
                    <RefreshCw className="size-4 animate-spin" />
                    Loading voice…
                  </>
                ) : (
                  <>
                    <Volume2 className="size-4" />
                    Read Aloud
                  </>
                )}
              </Button>
            )}
            {speaking && (
              <Button variant="outline" onClick={stopSpeaking}>
                <VolumeX className="size-4" />
                Stop Reading
              </Button>
            )}
          </div>

          {briefingGen.error && <p className="text-sm text-red-300">{briefingGen.error}</p>}

          {displayedBriefing && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              {briefingDate && !briefingGen.busy && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FileText className="size-3" />
                  Generated: {formatDateTime(briefingDate)}
                </div>
              )}
              <div
                className={cn(
                  "rounded-lg border bg-card p-4",
                  speaking && "border-primary/40 ring-1 ring-primary/20",
                )}
              >
                <StreamedProse text={displayedBriefing} streaming={briefingGen.busy} />
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* ── Executive Summary ── */}
      <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-background">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="size-5 text-amber-400" />
            Executive Summary
            <Badge className="ml-auto border-amber-500/30 bg-amber-500/20 text-amber-300">
              FOR MANAGEMENT
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {metricCards.map(({ label, value }) => (
              <div key={label} className="rounded-lg border bg-card/60 p-3 text-center">
                <div className="truncate text-lg font-bold tabular-nums" title={value}>
                  {value}
                </div>
                <div className="truncate text-xs text-muted-foreground" title={label}>
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* Real distribution of the first numeric column (DuckDB histogram,
              rendered off the main thread via OffscreenChart). */}
          {histogramOption && (
            <div className="rounded-lg border bg-card/40 p-2">
              <OffscreenChart
                option={histogramOption}
                height={220}
                fallback={
                  <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">
                    Chart rendering unavailable in this environment.
                  </div>
                }
              />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={generateSummary}
              disabled={summaryGen.busy}
              variant="outline"
              className="border-amber-500/30 text-amber-300 hover:bg-amber-500/10"
            >
              {summaryGen.busy ? (
                <>
                  <RefreshCw className="size-4 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Wand2 className="size-4" />
                  Generate Narrative
                </>
              )}
            </Button>
            {summaryGen.busy && (
              <Button size="sm" variant="ghost" onClick={summaryGen.cancel}>
                <Square className="size-3" />
                Stop
              </Button>
            )}
            {summaryText && !summaryGen.busy && (
              <>
                <Button size="sm" variant="ghost" onClick={copyToClipboard}>
                  <Clipboard className="size-3" />
                  {copied ? "Copied!" : "Copy"}
                </Button>
                <Button size="sm" variant="ghost" onClick={downloadTxt}>
                  <Download className="size-3" />
                  TXT
                </Button>
              </>
            )}
            {canExport && !summaryGen.busy && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => exportReport("pdf")}
                  disabled={exporting !== null}
                >
                  {exporting === "pdf" ? (
                    <RefreshCw className="size-3 animate-spin" />
                  ) : (
                    <Download className="size-3" />
                  )}
                  PDF
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => exportReport("docx")}
                  disabled={exporting !== null}
                >
                  {exporting === "docx" ? (
                    <RefreshCw className="size-3 animate-spin" />
                  ) : (
                    <FileText className="size-3" />
                  )}
                  DOCX
                </Button>
              </>
            )}
          </div>

          {summaryGen.error && <p className="text-sm text-red-300">{summaryGen.error}</p>}
          {exportError && <p className="text-sm text-red-300">{exportError}</p>}

          {displayedSummary && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              {summaryDate && !summaryGen.busy && (
                <div className="text-xs text-muted-foreground">
                  Generated: {formatDateTime(summaryDate)}
                </div>
              )}
              <div className="rounded-lg border bg-card/60 p-4">
                <StreamedProse text={displayedSummary} streaming={summaryGen.busy} />
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
