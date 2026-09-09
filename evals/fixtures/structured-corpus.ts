/**
 * Structured-output recovery corpus.
 *
 * Each case is a raw, model-LIKE string paired with the Zod schema it is
 * supposed to satisfy and a flag for whether `parseStructured` is EXPECTED to
 * recover a schema-valid value from it.
 *
 * The cases deliberately span the failure modes the prompt+repair lane exists
 * to absorb (see src/platform/ai/provider/structured.ts):
 *   - clean JSON (object root)
 *   - ```json … ``` fenced blocks (and bare ``` fences)
 *   - leading / trailing prose around a JSON value
 *   - minor JSON errors the repairer fixes (trailing commas, smart quotes)
 *   - GENUINELY broken / wrong-shape output that must NOT be "recovered"
 *
 * These are static strings (no model) so the deterministic eval is a true gate:
 * it measures the recovery rate of the real parser over a fixed corpus.
 *
 * Every case validates against the LIVE analysis-plan schema
 * (`analysisPlanSchema`, src/features/data-formulator/core/swarm/agents/
 * analyze.ts) — the same `schema.parse(...)` path production uses.
 */

import { type ZodType, z } from "zod";

export const analysisPlanSchema = z.object({
  goal: z.string(),
  reasoning: z.string(),
  sqlSpecs: z
    .array(
      z.object({
        id: z.string(),
        purpose: z.string(),
        sql: z.string(),
      }),
    )
    .max(4),
  chartSpecs: z
    .array(
      z.object({
        usesSqlId: z.string(),
        // Mirrors the canonical ChartType union in
        // src/features/data-formulator/core/types.ts — models legitimately emit
        // kinds like "multi-line", so the eval schema must accept them.
        type: z.enum([
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
        ]),
        x: z.string(),
        y: z.string(),
        series: z.string().optional(),
      }),
    )
    .max(3),
  anomalyChecks: z
    .array(
      z.object({
        usesSqlId: z.string(),
        kind: z.enum(["dip", "spike", "outlier", "trend"]),
      }),
    )
    .max(3),
});

/** One corpus entry: a raw output, its target schema, and the expected outcome. */
export interface StructuredCase {
  /** Stable id for reporting / debugging. */
  readonly id: string;
  /** Which target schema this raw output is meant to satisfy. */
  readonly schema: ZodType;
  /** The raw, model-like string fed to `parseStructured`. */
  readonly raw: string;
  /**
   * Whether `parseStructured` SHOULD recover a schema-valid value.
   * `true`  → recovery counts as a hit, a thrown error is a miss.
   * `false` → a thrown error is the CORRECT outcome (a "negative" case);
   *           silent recovery of a wrong-shape value would be a hit-for-the-
   *           wrong-reason, so negatives assert the parser rejects them.
   */
  readonly shouldRecover: boolean;
}

// ── Canonical payloads ───────────────────────────────────────────────────────

const planClean = `{
  "goal": "Find revenue anomalies",
  "reasoning": "Aggregate by day, then scan for dips.",
  "sqlSpecs": [
    { "id": "daily", "purpose": "Daily revenue", "sql": "SELECT date, SUM(amount) AS rev FROM v GROUP BY date" }
  ],
  "chartSpecs": [
    { "usesSqlId": "daily", "type": "line", "x": "date", "y": "rev" }
  ],
  "anomalyChecks": [
    { "usesSqlId": "daily", "kind": "dip" }
  ]
}`;

const planMultiSpec = `{
  "goal": "Compare revenue across regions and flag outliers",
  "reasoning": "Aggregate monthly totals per region, chart them side by side, then scan for outlier months.",
  "sqlSpecs": [
    { "id": "monthly", "purpose": "Monthly totals per region", "sql": "SELECT month, region, SUM(amount) AS total FROM v GROUP BY month, region" },
    { "id": "overall", "purpose": "Overall monthly trend", "sql": "SELECT month, SUM(amount) AS total FROM v GROUP BY month" }
  ],
  "chartSpecs": [
    { "usesSqlId": "monthly", "type": "multi-line", "x": "month", "y": "total", "series": "region" },
    { "usesSqlId": "overall", "type": "area", "x": "month", "y": "total" }
  ],
  "anomalyChecks": [
    { "usesSqlId": "overall", "kind": "outlier" },
    { "usesSqlId": "overall", "kind": "dip" }
  ]
}`;

const planEmptyArrays = `{
  "goal": "Describe the dataset",
  "reasoning": "No computation requested yet.",
  "sqlSpecs": [],
  "chartSpecs": [],
  "anomalyChecks": []
}`;

// ── Surface-form variants of planClean ───────────────────────────────────────

const planFencedJson = "```json\n" + planClean + "\n```";

const planFencedBare = "```\n" + planClean + "\n```";

const planTrailingProse =
  planClean + "\n\nThis plan keeps within the 4 sql / 3 chart / 3 anomaly limits.";

const planLeadingProse = "Here is the structured analysis you asked for:\n\n" + planClean;

const planProseSandwich =
  "Sure! Here's the plan.\n\n```json\n" + planClean + "\n```\n\nLet me know if you want changes.";

const planTrailingCommas = `{
  "goal": "Find revenue anomalies",
  "reasoning": "Aggregate by day, then scan for dips.",
  "sqlSpecs": [
    { "id": "daily", "purpose": "Daily revenue", "sql": "SELECT date, SUM(amount) AS rev FROM v GROUP BY date", },
  ],
  "chartSpecs": [
    { "usesSqlId": "daily", "type": "line", "x": "date", "y": "rev", },
  ],
  "anomalyChecks": [
    { "usesSqlId": "daily", "kind": "dip", },
  ],
}`;

const planSmartQuotes =
  "{\n" +
  "  “goal”: “Find revenue anomalies”,\n" +
  "  “reasoning”: “Aggregate by day, then scan for dips.”,\n" +
  "  “sqlSpecs”: [\n" +
  "    { “id”: “daily”, “purpose”: “Daily revenue”, “sql”: “SELECT date, SUM(amount) AS rev FROM v GROUP BY date” }\n" +
  "  ],\n" +
  "  “chartSpecs”: [],\n" +
  "  “anomalyChecks”: []\n" +
  "}";

const planFenceTrailingComma =
  "```json\n" +
  `{ "goal": "Find revenue anomalies", "reasoning": "Scan for dips.", "sqlSpecs": [ { "id": "daily", "purpose": "Daily revenue", "sql": "SELECT 1" }, ], "chartSpecs": [], "anomalyChecks": [], }` +
  "\n```";

// ── Negative cases (parser MUST reject — wrong shape / unrecoverable) ─────────

const planWrongShape = `{ "goal": "Find revenue anomalies" }`;

const planBadAnomalyKind = `{
  "goal": "Find revenue anomalies",
  "reasoning": "Scan for dips.",
  "sqlSpecs": [],
  "chartSpecs": [],
  "anomalyChecks": [ { "usesSqlId": "daily", "kind": "teleport" } ]
}`;

const planBadChartType = `{
  "goal": "Find revenue anomalies",
  "reasoning": "Scan for dips.",
  "sqlSpecs": [],
  "chartSpecs": [ { "usesSqlId": "daily", "type": "hologram", "x": "date", "y": "rev" } ],
  "anomalyChecks": []
}`;

const planSpecsNotArray = `{
  "goal": "Find revenue anomalies",
  "reasoning": "Scan for dips.",
  "sqlSpecs": { "id": "daily", "purpose": "Daily revenue", "sql": "SELECT 1" },
  "chartSpecs": [],
  "anomalyChecks": []
}`;

const proseOnly = "I could not find any anomalies worth reporting in this dataset.";

const truncated = `{ "goal": "Find revenue anomalies", "reasoning": "Cut off`;

export const STRUCTURED_CASES: readonly StructuredCase[] = [
  // Positives — should recover.
  { id: "plan.clean", schema: analysisPlanSchema, raw: planClean, shouldRecover: true },
  {
    id: "plan.multiSpec",
    schema: analysisPlanSchema,
    raw: planMultiSpec,
    shouldRecover: true,
  },
  {
    id: "plan.emptyArrays",
    schema: analysisPlanSchema,
    raw: planEmptyArrays,
    shouldRecover: true,
  },
  {
    id: "plan.fencedJson",
    schema: analysisPlanSchema,
    raw: planFencedJson,
    shouldRecover: true,
  },
  {
    id: "plan.fencedBare",
    schema: analysisPlanSchema,
    raw: planFencedBare,
    shouldRecover: true,
  },
  {
    id: "plan.trailingProse",
    schema: analysisPlanSchema,
    raw: planTrailingProse,
    shouldRecover: true,
  },
  {
    id: "plan.leadingProse",
    schema: analysisPlanSchema,
    raw: planLeadingProse,
    shouldRecover: true,
  },
  {
    id: "plan.proseSandwich",
    schema: analysisPlanSchema,
    raw: planProseSandwich,
    shouldRecover: true,
  },
  {
    id: "plan.trailingCommas",
    schema: analysisPlanSchema,
    raw: planTrailingCommas,
    shouldRecover: true,
  },
  {
    id: "plan.smartQuotes",
    schema: analysisPlanSchema,
    raw: planSmartQuotes,
    shouldRecover: true,
  },
  {
    id: "plan.fenceTrailingComma",
    schema: analysisPlanSchema,
    raw: planFenceTrailingComma,
    shouldRecover: true,
  },

  // Negatives — should be rejected (throw), NOT silently coerced.
  {
    id: "plan.wrongShape",
    schema: analysisPlanSchema,
    raw: planWrongShape,
    shouldRecover: false,
  },
  {
    id: "plan.badAnomalyKind",
    schema: analysisPlanSchema,
    raw: planBadAnomalyKind,
    shouldRecover: false,
  },
  {
    id: "plan.badChartType",
    schema: analysisPlanSchema,
    raw: planBadChartType,
    shouldRecover: false,
  },
  {
    id: "plan.specsNotArray",
    schema: analysisPlanSchema,
    raw: planSpecsNotArray,
    shouldRecover: false,
  },
  { id: "prose.only", schema: analysisPlanSchema, raw: proseOnly, shouldRecover: false },
  {
    id: "plan.truncated",
    schema: analysisPlanSchema,
    raw: truncated,
    shouldRecover: false,
  },
];

/** Positive cases only — the strings a healthy parser must recover. */
export const POSITIVE_CASES: readonly StructuredCase[] = STRUCTURED_CASES.filter(
  (c) => c.shouldRecover,
);

/** Negative cases only — the strings a healthy parser must reject. */
export const NEGATIVE_CASES: readonly StructuredCase[] = STRUCTURED_CASES.filter(
  (c) => !c.shouldRecover,
);
