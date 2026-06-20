/**
 * Structured-output recovery corpus.
 *
 * Each case is a raw, model-LIKE string paired with the Zod schema it is
 * supposed to satisfy and a flag for whether `parseStructured` is EXPECTED to
 * recover a schema-valid value from it.
 *
 * The cases deliberately span the failure modes the prompt+repair lane exists
 * to absorb (see src/platform/ai/provider/structured.ts):
 *   - clean JSON (object and array roots)
 *   - ```json … ``` fenced blocks (and bare ``` fences)
 *   - leading / trailing prose around a JSON value
 *   - minor JSON errors the repairer fixes (trailing commas, smart quotes)
 *   - GENUINELY broken / wrong-shape output that must NOT be "recovered"
 *
 * These are static strings (no model) so the deterministic eval is a true gate:
 * it measures the recovery rate of the real parser over a fixed corpus.
 *
 * Schemas are the REAL ones the app validates against, so the corpus exercises
 * the same `schema.parse(...)` path production uses.
 */

import type { ZodType } from "zod";
import { LlmInsightResponseSchema } from "@/features/ai-analysis/model/insight-schema";
import { TransformRecipeSchema } from "@/features/data-transform/ai/recipe-schema";
import { analysisPlanSchema } from "@/features/data-formulator/core/swarm/agents/analyze";

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

// ── Clean JSON (object root) ─────────────────────────────────────────────────

const insightClean = `{
  "insights": [
    {
      "category": "anomaly",
      "title": "Revenue dip on 2024-03-12",
      "description": "Daily revenue fell 38% versus the trailing 7-day mean.",
      "severity": "warning",
      "impact": "high",
      "confidence": 0.82
    }
  ]
}`;

const recipeClean = `{
  "steps": [
    { "type": "filter", "label": "Amount over 100", "condition": "amount > 100" },
    { "type": "sort", "label": "Newest first", "column": "date", "direction": "DESC" }
  ]
}`;

// ── Fenced ```json blocks ────────────────────────────────────────────────────

const insightFencedJson = "```json\n" + insightClean + "\n```";

const recipeFencedBare =
  "```\n" + `{ "steps": [ { "type": "limit", "label": "Top 50", "count": 50 } ] }` + "\n```";

// ── Trailing / leading prose around a JSON value ─────────────────────────────

const insightTrailingProse =
  insightClean + "\n\nThat insight highlights the most material movement in the data.";

const insightLeadingProse = "Here is the structured analysis you asked for:\n\n" + insightClean;

const recipeProseSandwich =
  "Sure! Here's the recipe.\n\n```json\n" +
  `{ "steps": [ { "type": "select", "label": "Keep two cols", "columns": "date, amount" } ] }` +
  "\n```\n\nLet me know if you want more steps.";

// ── Minor JSON errors the repairer fixes ─────────────────────────────────────

const recipeTrailingCommas = `{
  "steps": [
    { "type": "deduplicate", "label": "Drop dupes", },
    { "type": "limit", "label": "Cap rows", "count": 1000, },
  ],
}`;

const insightSmartQuotes =
  "{\n" +
  "  “insights”: [\n" +
  "    {\n" +
  "      “category”: “trend”,\n" +
  "      “title”: “Upward trend in signups”,\n" +
  "      “description”: “Signups grew steadily across the window.”,\n" +
  "      “severity”: “info”,\n" +
  "      “impact”: “medium”,\n" +
  "      “confidence”: 0.6\n" +
  "    }\n" +
  "  ]\n" +
  "}";

const insightFenceTrailingComma =
  "```json\n" +
  `{ "insights": [ { "category": "quality", "title": "Nulls in region", "description": "12% of region values are null.", "severity": "warning", "impact": "low", "confidence": 0.5, }, ] }` +
  "\n```";

// ── Plan schema (nested arrays of flat objects) ──────────────────────────────

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

const planFencedTrailingProse =
  "```json\n" +
  planClean +
  "\n```\n\nThis plan keeps within the 4 sql / 3 chart / 3 anomaly limits.";

// ── Negative cases (parser MUST reject — wrong shape / unrecoverable) ─────────

// Valid JSON, but wrong shape for the insight schema (missing required fields).
const insightWrongShape = `{ "insights": [ { "category": "anomaly", "title": "x" } ] }`;

// Enum value outside the allowed set — schema must reject even though JSON parses.
const recipeBadEnum = `{ "steps": [ { "type": "teleport", "label": "nope" } ] }`;

// confidence out of [0,1] range — a constraint the repairer can't fix.
const insightOutOfRange = `{ "insights": [ { "category": "trend", "title": "t", "description": "d", "severity": "info", "impact": "low", "confidence": 5 } ] }`;

// No JSON at all — pure prose.
const proseOnly = "I could not find any anomalies worth reporting in this dataset.";

// Truncated / unbalanced JSON the extractor cannot close.
const truncated = `{ "insights": [ { "category": "anomaly", "title": "Cut off`;

export const STRUCTURED_CASES: readonly StructuredCase[] = [
  // Positives — should recover.
  { id: "insight.clean", schema: LlmInsightResponseSchema, raw: insightClean, shouldRecover: true },
  { id: "recipe.clean", schema: TransformRecipeSchema, raw: recipeClean, shouldRecover: true },
  {
    id: "insight.fencedJson",
    schema: LlmInsightResponseSchema,
    raw: insightFencedJson,
    shouldRecover: true,
  },
  {
    id: "recipe.fencedBare",
    schema: TransformRecipeSchema,
    raw: recipeFencedBare,
    shouldRecover: true,
  },
  {
    id: "insight.trailingProse",
    schema: LlmInsightResponseSchema,
    raw: insightTrailingProse,
    shouldRecover: true,
  },
  {
    id: "insight.leadingProse",
    schema: LlmInsightResponseSchema,
    raw: insightLeadingProse,
    shouldRecover: true,
  },
  {
    id: "recipe.proseSandwich",
    schema: TransformRecipeSchema,
    raw: recipeProseSandwich,
    shouldRecover: true,
  },
  {
    id: "recipe.trailingCommas",
    schema: TransformRecipeSchema,
    raw: recipeTrailingCommas,
    shouldRecover: true,
  },
  {
    id: "insight.smartQuotes",
    schema: LlmInsightResponseSchema,
    raw: insightSmartQuotes,
    shouldRecover: true,
  },
  {
    id: "insight.fenceTrailingComma",
    schema: LlmInsightResponseSchema,
    raw: insightFenceTrailingComma,
    shouldRecover: true,
  },
  { id: "plan.clean", schema: analysisPlanSchema, raw: planClean, shouldRecover: true },
  {
    id: "plan.fencedTrailingProse",
    schema: analysisPlanSchema,
    raw: planFencedTrailingProse,
    shouldRecover: true,
  },

  // Negatives — should be rejected (throw), NOT silently coerced.
  {
    id: "insight.wrongShape",
    schema: LlmInsightResponseSchema,
    raw: insightWrongShape,
    shouldRecover: false,
  },
  { id: "recipe.badEnum", schema: TransformRecipeSchema, raw: recipeBadEnum, shouldRecover: false },
  {
    id: "insight.outOfRange",
    schema: LlmInsightResponseSchema,
    raw: insightOutOfRange,
    shouldRecover: false,
  },
  { id: "prose.only", schema: LlmInsightResponseSchema, raw: proseOnly, shouldRecover: false },
  {
    id: "insight.truncated",
    schema: LlmInsightResponseSchema,
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
