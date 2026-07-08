"use client";

import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ChevronRight,
  Download,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { motion } from "motion/react";
import { memo, useCallback, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAI } from "@/platform/ai/provider";
import { getAnalysisProxy } from "@/platform/viz";
import { cn } from "@/shared/utils";
import type { BriefingContext } from "../core/briefing-context";
import { fetchColumnOutliers, fetchColumnSample } from "../core/briefing-context";
import { exportBriefingReport } from "../core/briefing-export";
import { buildAnomalyExplanationPrompt, buildAnomalyReportPrompt } from "../core/briefing-prompts";
import { AnomalyExplanationSchema } from "../core/briefing-schemas";
import { useStreamingGeneration } from "../hooks/useStreamingGeneration";
import { useBriefingStore } from "../store/briefing-store";

type Severity = "HIGH" | "MEDIUM" | "LOW";

interface AnomalyResult {
  column: string;
  count: number;
  severity: Severity;
  maxZ: number;
  /** Count confirmed by the Generalized-ESD (Rosner) test on a seeded sample. */
  gesdCount: number;
  mean: number;
  std: number;
  min: number;
  max: number;
  examples: number[];
  explanation: string | null;
  hypotheses: string[];
  sql: string | null;
  loadingExplain: boolean;
}

function severityColor(s: Severity): string {
  if (s === "HIGH") return "bg-red-500/20 text-red-300 border-red-500/30";
  if (s === "MEDIUM") return "bg-orange-500/20 text-orange-300 border-orange-500/30";
  return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
}

function quoteIdent(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

// Memoized row so re-running explain on one anomaly doesn't re-render the rest.
const AnomalyRow = memo(function AnomalyRow({
  anomaly,
  index,
  animate,
  onExplain,
}: {
  anomaly: AnomalyResult;
  index: number;
  animate: boolean;
  onExplain: (column: string) => void;
}) {
  return (
    <motion.div
      initial={animate ? { opacity: 0, x: -8 } : false}
      animate={{ opacity: 1, x: 0 }}
      transition={animate ? { delay: Math.min(index, 8) * 0.05 } : undefined}
    >
      <Card className="border-orange-500/20">
        <CardContent className="space-y-3 pt-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-mono text-sm font-medium">{anomaly.column}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {anomaly.count} unusual values · z-score up to {anomaly.maxZ} · range{" "}
                {Number(anomaly.min.toFixed(2))}–{Number(anomaly.max.toFixed(2))}
                {anomaly.gesdCount > 0 && (
                  <span className="ml-1 text-orange-300">
                    · {anomaly.gesdCount} confirmed by Generalized-ESD
                  </span>
                )}
              </div>
            </div>
            <Badge className={cn("shrink-0", severityColor(anomaly.severity))}>
              {anomaly.severity}
            </Badge>
          </div>

          {anomaly.loadingExplain && (
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          )}

          {anomaly.explanation && (
            <div className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
              {anomaly.explanation}
            </div>
          )}

          {anomaly.hypotheses.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                Root cause hypotheses:
              </div>
              <ul className="space-y-1">
                {anomaly.hypotheses.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    <ChevronRight className="mt-0.5 size-3 shrink-0 text-orange-400" />
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {anomaly.sql && (
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                Investigation SQL:
              </div>
              <pre className="overflow-x-auto rounded-md bg-muted/60 p-2.5 font-mono text-xs text-primary">
                {anomaly.sql}
              </pre>
            </div>
          )}

          {!anomaly.explanation && !anomaly.loadingExplain && (
            <Button size="sm" variant="outline" onClick={() => onExplain(anomaly.column)}>
              <Brain className="size-3" />
              Explain with AI
            </Button>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
});

export default function AnomalyReportTab({ context }: { context: BriefingContext }) {
  const [anomalies, setAnomalies] = useState<AnomalyResult[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const ai = useAI();
  const reportGen = useStreamingGeneration();
  const { saveBriefing } = useBriefingStore();

  // Live stream while generating; otherwise the last completed report text.
  const reportText = reportGen.text;

  /**
   * Analysis never touches raw rows on the main thread:
   *  - per-column mean/std come from the DuckDB-aggregated `BriefingContext`,
   *  - a *seeded* reservoir sample is pulled via SQL and the heavy stats (z-score
   *    outliers + the rigorous Generalized-ESD test) run in the shared seeded
   *    analysis worker (`getAnalysisProxy`), not a hand-rolled main-thread pass,
   *  - example outlier values come from a capped SQL outlier query.
   * Everything is deterministic (seed 42) — no `Math.random`, no fake z-scores.
   */
  const runAnalysis = useCallback(async () => {
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const analysis = getAnalysisProxy();
      const results: AnomalyResult[] = [];
      for (const col of context.numericCols) {
        if (!Number.isFinite(col.std) || col.std <= 0) continue;

        // Seeded sample → off-main-thread seeded stats.
        const sample = await fetchColumnSample(context.tableName, col.name, 4000);
        if (sample.length < 4) continue;

        let count = 0;
        let maxScore = 0;
        let gesdCount = 0;

        if (analysis) {
          const [z, gesd] = await Promise.all([
            analysis.detectAnomalies(sample, { method: "zscore", threshold: 2.5 }),
            analysis.gesdAnomalies(sample, { alpha: 0.05 }),
          ]);
          count = z.indices.length;
          maxScore = z.scores.length ? Math.max(...z.scores) : 0;
          gesdCount = gesd.indices.length;
        } else {
          // Worker unavailable: deterministic inline z-score over the sample.
          for (const v of sample) {
            const score = Math.abs((v - col.mean) / col.std);
            if (score > 2.5) {
              count++;
              if (score > maxScore) maxScore = score;
            }
          }
        }

        if (count === 0 && gesdCount === 0) continue;

        const severity: Severity = maxScore > 4 ? "HIGH" : maxScore > 3 ? "MEDIUM" : "LOW";

        // A few concrete example outlier values, fetched via SQL (capped).
        const exampleRows = await fetchColumnOutliers(
          context.tableName,
          col.name,
          col.mean,
          col.std,
          2.5,
          12,
        );
        const examples = exampleRows.slice(0, 3);

        results.push({
          column: col.name,
          count,
          severity,
          maxZ: Math.round(maxScore * 100) / 100,
          gesdCount,
          mean: col.mean,
          std: col.std,
          min: col.min,
          max: col.max,
          examples,
          explanation: null,
          hypotheses: [],
          sql:
            `SELECT * FROM ${quoteIdent(context.tableName)}\n` +
            `WHERE abs((${quoteIdent(col.name)} - ${Number(col.mean.toFixed(4))}) / ${Number(
              col.std.toFixed(4),
            )}) > 3\n` +
            `ORDER BY abs((${quoteIdent(col.name)} - ${Number(col.mean.toFixed(4))}) / ${Number(
              col.std.toFixed(4),
            )}) DESC\nLIMIT 100`,
          loadingExplain: false,
        });
      }
      results.sort((a, b) => b.maxZ - a.maxZ);
      setAnomalies(results);
      setAnalyzed(true);
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : "Anomaly analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  }, [context]);

  const explainAnomaly = useCallback(
    async (column: string) => {
      const target = anomalies.find((a) => a.column === column);
      if (!target) return;
      setAnomalies((prev) =>
        prev.map((a) => (a.column === column ? { ...a, loadingExplain: true } : a)),
      );
      try {
        const { system, prompt } = buildAnomalyExplanationPrompt({
          datasetName: context.datasetName,
          column: target.column,
          count: target.count,
          maxZ: target.maxZ,
          min: target.min,
          max: target.max,
          examples: target.examples,
        });
        const parsed = await ai.generateStructured(
          { system, prompt, maxTokens: 400, temperature: 0.4 },
          AnomalyExplanationSchema,
        );
        setAnomalies((prev) =>
          prev.map((a) =>
            a.column === column
              ? {
                  ...a,
                  explanation: parsed.explanation,
                  hypotheses: parsed.hypotheses.slice(0, 3),
                  loadingExplain: false,
                }
              : a,
          ),
        );
      } catch {
        setAnomalies((prev) =>
          prev.map((a) => (a.column === column ? { ...a, loadingExplain: false } : a)),
        );
      }
    },
    [anomalies, ai, context.datasetName],
  );

  const generateFullReport = useCallback(async () => {
    if (anomalies.length === 0) return;
    const summary = anomalies
      .map(
        (a) =>
          `${a.column}: ${a.count} anomalies (z-score ${a.maxZ}, ${a.severity}). ${
            a.explanation ?? "No explanation generated yet."
          }`,
      )
      .join("\n");
    const { system, prompt } = buildAnomalyReportPrompt({
      datasetName: context.datasetName,
      summary,
    });
    try {
      const report = await reportGen.run(system, prompt, { maxTokens: 800, temperature: 0.4 });
      if (!report.trim()) return;
      saveBriefing(report, "anomaly");
    } catch {
      /* error surfaced via reportGen.error */
    }
  }, [anomalies, context.datasetName, reportGen, saveBriefing]);

  // Branded, paginated PDF: anomaly table + the AI investigation narrative,
  // generated off the main thread via the export worker and saved via saveBytes.
  const exportReport = useCallback(async () => {
    if (anomalies.length === 0) return;
    setExporting(true);
    setExportError(null);
    try {
      const tableLines = anomalies
        .map(
          (a) =>
            `${a.column} — ${a.severity}: ${a.count} z-outliers (z≤${a.maxZ}` +
            `${a.gesdCount > 0 ? `, ${a.gesdCount} GESD-confirmed` : ""}). ` +
            `${a.explanation ?? ""}`,
        )
        .join("\n\n");
      await exportBriefingReport({
        context,
        kind: "pdf",
        title: "Anomaly Investigation Report",
        fileBase: "anomaly-report",
        narrative: [
          { label: "Detected anomalies", text: tableLines },
          { label: "Investigation narrative", text: reportText },
        ],
      });
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }, [anomalies, context, reportText]);

  const totals = useMemo(
    () => ({
      total: anomalies.reduce((s, a) => s + a.count, 0),
      critical: anomalies.filter((a) => a.severity === "HIGH").length,
      columns: anomalies.length,
    }),
    [anomalies],
  );

  const hasNumeric = context.numericCols.length > 0;

  return (
    <div className="space-y-6">
      <Card className="border-red-500/20 bg-gradient-to-br from-red-500/5 to-background">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-red-400" />
            Anomaly Investigation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasNumeric && (
            <p className="text-sm text-muted-foreground">
              This dataset has no numeric columns, so statistical anomaly detection is not
              applicable.
            </p>
          )}

          {hasNumeric && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={runAnalysis} disabled={analyzing}>
                {analyzing ? (
                  <>
                    <RefreshCw className="size-4 animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" />
                    Analyze Data
                  </>
                )}
              </Button>
              {analyzed && anomalies.length > 0 && (
                <Button variant="outline" onClick={generateFullReport} disabled={reportGen.busy}>
                  {reportGen.busy ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : (
                    <Brain className="size-4" />
                  )}
                  Generate Full Report
                </Button>
              )}
              {analyzed && anomalies.length > 0 && (
                <Button
                  variant="outline"
                  onClick={exportReport}
                  disabled={exporting || reportGen.busy}
                >
                  {exporting ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  Export PDF
                </Button>
              )}
            </div>
          )}

          {analyzeError && <p className="text-sm text-red-300">{analyzeError}</p>}
          {reportGen.error && <p className="text-sm text-red-300">{reportGen.error}</p>}
          {exportError && <p className="text-sm text-red-300">{exportError}</p>}

          {reportText && (
            <div className="whitespace-pre-wrap rounded-lg border bg-card/60 p-4 text-sm leading-relaxed">
              {reportText}
            </div>
          )}

          {analyzed && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Total Anomalies", value: totals.total, color: "text-orange-400" },
                  { label: "Critical", value: totals.critical, color: "text-red-400" },
                  { label: "Affected Columns", value: totals.columns, color: "text-yellow-400" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="rounded-lg border bg-card/60 p-3 text-center">
                    <div className={cn("text-2xl font-bold tabular-nums", color)}>{value}</div>
                    <div className="text-xs text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>

              {anomalies.length === 0 && (
                <div className="flex items-center gap-2 text-sm text-emerald-400">
                  <CheckCircle2 className="size-4" />
                  No significant anomalies detected in the dataset.
                </div>
              )}

              <div className="space-y-4">
                {anomalies.map((anomaly, idx) => (
                  <AnomalyRow
                    key={anomaly.column}
                    anomaly={anomaly}
                    index={idx}
                    animate={idx < 8}
                    onExplain={explainAnomaly}
                  />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
