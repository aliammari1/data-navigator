/**
 * Zod schemas for grammar-constrained structured output.
 *
 * These drive `aiStructured()` — the provider builds a GBNF/JSON-schema grammar
 * from these (llamacpp) or validates a prompt-driven response against them
 * (transformers.js). They are deliberately FLAT (object / array / enum / string /
 * number) to stay inside the grammar-supported subset (no $ref / allOf / regex).
 */

import { z } from "zod";

export const CHART_TYPES = [
  "bar",
  "horizontal-bar",
  "stacked-bar",
  "stacked-horizontal-bar",
  "line",
  "area",
  "multi-line",
  "pie",
  "donut",
  "scatter",
  "bubble",
  "heatmap",
  "treemap",
  "radar",
  "gauge",
  "funnel",
  "kpi-grid",
  "data-table",
] as const;

/**
 * A single planned widget. `position` is intentionally omitted from the grammar
 * — the deterministic `gridPos()` layout assigns positions after parsing, which
 * is both more reliable than asking a small model to do grid math and keeps the
 * schema flat.
 */
export const PlannedWidgetSchema = z.object({
  id: z.string(),
  title: z.string(),
  chartType: z.enum(CHART_TYPES),
  sqlIntent: z.string(),
  dimensions: z.array(z.string()),
  metrics: z.array(z.string()),
  reasoning: z.string(),
});

export const DashboardPlanSchema = z.object({
  title: z.string(),
  description: z.string(),
  widgets: z.array(PlannedWidgetSchema).min(3).max(9),
});

export type PlannedWidget = z.infer<typeof PlannedWidgetSchema>;
export type DashboardPlanLLM = z.infer<typeof DashboardPlanSchema>;

/** Insight for the narrator / per-widget enrichment. */
export const InsightSchema = z.object({
  insight: z.string(),
});
export type InsightLLM = z.infer<typeof InsightSchema>;

/** Single-sentence dataset summary. */
export const SummarySchema = z.object({
  summary: z.string(),
});
export type SummaryLLM = z.infer<typeof SummarySchema>;
