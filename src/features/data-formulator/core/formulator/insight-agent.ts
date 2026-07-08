/**
 * Insight agent — one grammar-constrained call that reads the CURRENT chart's
 * aggregated rows and returns a short, grounded analysis (headline + bullets).
 *
 * Deliberately opt-in (the UI exposes an « Analyser » button): on a local
 * 1.5–4B model an unrequested multi-second generation after every shelf
 * change would be pure loading theatre. Grounding is the chart's OWN
 * aggregated output — never raw-table samples — so the model comments on
 * exactly what the user is looking at.
 */

import { z } from "zod";
import { safeJsonStringify } from "../json";
import { resolveRuntime } from "./derive-agent";
import type { Row, TableNode } from "./model";

export const ChartInsightSchema = z.object({
  /** One-line takeaway, e.g. « Le canal WEB concentre 82 % des échecs ». */
  headline: z.string(),
  bullets: z.array(z.string()).min(2).max(4),
  /** Data caveat when one applies (échantillon tronqué, valeurs nulles…) — empty string otherwise. */
  caveat: z.string(),
});

export type ChartInsight = z.infer<typeof ChartInsightSchema>;

/** Rows embedded in the prompt — the chart is already aggregated, so few are needed. */
const INSIGHT_MAX_ROWS = 30;

const INSIGHT_SYSTEM = [
  "You analyse a chart for an offline analytics app. The rows you receive ARE the",
  "chart's aggregated data — every claim must be verifiable from them alone; never",
  "invent numbers or trends. Answer in French. headline: one factual takeaway with",
  "the key number. bullets: 2-4 short observations (comparisons, extremes,",
  "concentrations). caveat: one data caveat if any applies, else an empty string.",
].join(" ");

export interface ChartInsightInput {
  node: TableNode;
  chartType: string;
  /** The resolved (aggregated) chart rows from useChartData. */
  rows: Row[];
  /** The NL instruction that produced the focused table, when derived. */
  instruction?: string;
  signal?: AbortSignal;
}

export async function generateChartInsight(input: ChartInsightInput): Promise<ChartInsight> {
  const sample = input.rows.slice(0, INSIGHT_MAX_ROWS);
  const prompt = [
    `Table: ${input.node.name} (${input.node.rowCount} lignes source)`,
    input.instruction ? `Question d'origine: ${input.instruction}` : "",
    `Type de graphique: ${input.chartType}`,
    `Données du graphique (${sample.length}${input.rows.length > sample.length ? ` sur ${input.rows.length}` : ""} lignes):`,
    safeJsonStringify(sample),
    "Analyse ces données.",
  ]
    .filter(Boolean)
    .join("\n");

  const { provider, model } = await resolveRuntime();
  return provider.generateStructured(
    {
      model,
      system: INSIGHT_SYSTEM,
      prompt,
      maxTokens: 512,
      temperature: 0.2,
      signal: input.signal,
    },
    ChartInsightSchema,
  );
}
