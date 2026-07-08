// ─── Insight generation: rule-based core + optional LLM narration ─────────────
//
// `buildRuleInsights` is deterministic, offline, and always available — it is
// what renders immediately. `narrateInsights` OPTIONALLY augments/replaces that
// set using the existing offline AI provider runtime (`useAI`), validated by a
// Zod schema. Narration never blocks the UI and degrades silently to the
// rule-based set on any failure (no model loaded, parse error, abort).

import { nanoid } from "nanoid";
import type { ZodType } from "zod";
import { INSIGHT_SCHEMA_HINT, type LlmInsightResponse } from "./insight-schema";
import { linearRegression } from "./stats";
import type {
  Anomaly,
  ClusterGroup,
  ColStat,
  Correlation,
  ForecastMeta,
  ForecastPoint,
  Insight,
} from "./types";

export interface AnalysisFacts {
  rowCount: number;
  numericColumns: number;
  categoricalColumns: number;
  colStats: ColStat[];
  anomalies: Anomaly[];
  correlations: Correlation[];
  forecasts: ForecastPoint[];
  clusters: ClusterGroup[];
  forecastMeta: ForecastMeta;
}

// ─── Rule-based insights (deterministic, offline) ────────────────────────────

export function buildRuleInsights(facts: AnalysisFacts): Insight[] {
  const insights: Insight[] = [];
  const { forecasts, correlations, anomalies, colStats, clusters, forecastMeta } = facts;

  // Trend.
  const actuals = forecasts.filter((f) => f.actual !== undefined);
  if (actuals.length > 3 && forecastMeta.metricCol) {
    const first = actuals[0].actual ?? 0;
    const last = actuals[actuals.length - 1].actual ?? 0;
    const pct = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
    const reg = linearRegression(
      actuals.map((_, i) => i),
      actuals.map((f) => f.actual ?? 0),
    );
    insights.push({
      id: `trend_${forecastMeta.metricCol}`,
      category: "trend",
      title: `${forecastMeta.metricCol} ${pct >= 0 ? "growth" : "decline"} detected`,
      description: `Average ${forecastMeta.metricCol} ${pct >= 0 ? "increased" : "decreased"} by ${Math.abs(pct).toFixed(1)}% across the observed series (linear fit R²=${reg.r2.toFixed(3)}).`,
      severity: Math.abs(pct) > 20 ? "warning" : "info",
      confidence: Math.min(0.99, 0.5 + reg.r2 / 2),
      impact: Math.abs(pct) > 15 ? "high" : "medium",
      metric: forecastMeta.metricCol,
      value: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`,
      change: pct,
      acknowledged: false,
    });
  }

  // Top correlation.
  if (correlations.length > 0) {
    const top = correlations[0];
    insights.push({
      id: "corr_top",
      category: "correlation",
      title: `Strong correlation: ${top.col1} ↔ ${top.col2}`,
      description: `Pearson r=${top.pearson.toFixed(3)} (${top.strength.replace("_", " ")} ${top.direction}). ${top.col1} explains ${(top.pearson ** 2 * 100).toFixed(1)}% of the variance in ${top.col2}.`,
      severity: "info",
      confidence: 0.9 + Math.min(0.09, Math.abs(top.pearson) / 10),
      impact: top.strength === "very_strong" ? "high" : "medium",
      metric: `${top.col1} vs ${top.col2}`,
      value: `r = ${top.pearson.toFixed(3)}`,
      acknowledged: false,
    });
  }

  // Critical anomalies.
  const critical = anomalies.filter((a) => a.severity === "critical");
  if (critical.length > 0) {
    insights.push({
      id: "anomaly_critical",
      category: "anomaly",
      title: `${critical.length} critical anomalies detected`,
      description: `Critical issues in: ${[...new Set(critical.map((a) => a.column))].join(", ")}. Immediate review recommended.`,
      severity: "critical",
      confidence: 0.92,
      impact: "high",
      acknowledged: false,
    });
  }

  // Data quality.
  const nullCols = colStats.filter((s) => s.rowCount > 0 && s.nullCount > s.rowCount * 0.05);
  if (nullCols.length > 0) {
    insights.push({
      id: "quality_nulls",
      category: "quality",
      title: "Data completeness issue",
      description: `${nullCols.length} column${nullCols.length > 1 ? "s have" : " has"} >5% missing values: ${nullCols.map((c) => c.name).join(", ")}. Consider imputation or improved collection.`,
      severity: "warning",
      confidence: 1,
      impact: "medium",
      metric: "completeness",
      value: `${nullCols.length} affected`,
      acknowledged: false,
    });
  }

  // Top segment.
  if (clusters.length > 0) {
    const top = clusters[0];
    const summary = Object.entries(top.centroid)
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${v.toFixed(2)}`)
      .join(", ");
    insights.push({
      id: "pattern_top",
      category: "pattern",
      title: `Largest segment: ${top.label}`,
      description: `Cluster "${top.label}" (${top.characteristics.join(", ")}) spans ${top.size.toLocaleString()} sampled rows — ${summary}.`,
      severity: "success",
      confidence: 0.82,
      impact: "high",
      value: top.label,
      acknowledged: false,
    });
  }

  // Forecast.
  const future = forecasts.filter((f) => f.actual === undefined);
  if (future.length > 0 && forecastMeta.metricCol) {
    const lastFuture = future[future.length - 1];
    const lastActual = forecasts.findLast((f) => f.actual !== undefined);
    const delta = lastActual
      ? lastFuture.predicted - (lastActual.actual ?? lastActual.predicted)
      : 0;
    insights.push({
      id: `forecast_${forecastMeta.metricCol}`,
      category: "forecast",
      title: `6-period ${forecastMeta.metricCol} forecast`,
      description: `Projected ${delta >= 0 ? "+" : ""}${delta.toFixed(0)} change in avg ${forecastMeta.metricCol} over 6 periods (${forecastMeta.method}). 95% CI at horizon: [${lastFuture.lower.toFixed(0)}, ${lastFuture.upper.toFixed(0)}].`,
      severity: delta < 0 ? "warning" : "info",
      confidence: 0.76,
      impact: "high",
      metric: `${forecastMeta.metricCol} forecast`,
      value: lastFuture.predicted.toFixed(0),
      acknowledged: false,
    });
  }

  return insights;
}

// ─── Compact, model-friendly fact bundle ─────────────────────────────────────

function compactFacts(facts: AnalysisFacts): Record<string, unknown> {
  return {
    rows: facts.rowCount,
    columns: {
      numeric: facts.numericColumns,
      categorical: facts.categoricalColumns,
    },
    numericStats: facts.colStats
      .filter((s) => s.type === "numeric")
      .slice(0, 12)
      .map((s) => ({
        column: s.name,
        min: round(s.min),
        max: round(s.max),
        avg: round(s.avg),
        stddev: round(s.stddev),
        median: round(s.median),
        skewness: round(s.skewness),
        nullPct: s.rowCount > 0 ? round((s.nullCount / s.rowCount) * 100) : 0,
      })),
    topCorrelations: facts.correlations.slice(0, 6).map((c) => ({
      pair: `${c.col1}~${c.col2}`,
      r: round(c.pearson),
      strength: c.strength,
    })),
    anomalies: facts.anomalies.slice(0, 8).map((a) => ({
      column: a.column,
      type: a.type,
      severity: a.severity,
      affectedRows: a.affectedRows,
      method: a.method,
    })),
    segments: facts.clusters.slice(0, 5).map((c) => ({
      label: c.label,
      size: c.size,
      traits: c.characteristics,
    })),
    forecast: facts.forecastMeta,
  };
}

function round(v: number | undefined): number | null {
  if (v === undefined || !Number.isFinite(v)) return null;
  return Number(v.toFixed(4));
}

// ─── LLM narration (optional, schema-validated, non-blocking) ─────────────────

export interface NarrateDeps {
  /** `useAI().generateStructured` bound to the active offline provider. */
  generateStructured: <T>(
    req: {
      system?: string;
      prompt: string;
      maxTokens?: number;
      temperature?: number;
      signal?: AbortSignal;
    },
    schema: ZodType<T>,
  ) => Promise<T>;
  schema: ZodType<LlmInsightResponse>;
  signal?: AbortSignal;
}

export async function narrateInsights(facts: AnalysisFacts, deps: NarrateDeps): Promise<Insight[]> {
  const factJson = JSON.stringify(compactFacts(facts));
  const prompt =
    `Here are computed statistics from a dataset (all numbers are exact):\n${factJson}\n\n` +
    `Write up to 6 concise, ranked, business-relevant insights grounded ONLY in these numbers. ` +
    `Do not invent values. Prefer the most material findings (largest anomalies, strongest correlations, clearest trends).\n` +
    `Return ONLY JSON of this shape:\n${INSIGHT_SCHEMA_HINT}`;

  const result = await deps.generateStructured(
    {
      system:
        "You are a precise, conservative data analyst. Use only the provided numbers and never fabricate figures.",
      prompt,
      maxTokens: 1024,
      temperature: 0.2,
      signal: deps.signal,
    },
    deps.schema,
  );

  return result.insights.map((i) => ({
    id: `llm_${nanoid(8)}`,
    category: i.category,
    title: i.title,
    description: i.description,
    severity: i.severity,
    confidence: i.confidence,
    impact: i.impact,
    acknowledged: false,
  }));
}
