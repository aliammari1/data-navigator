"use client";

/**
 * Moudir AI — Tier 2, call #1: PLAN + SPEC.
 *
 * Collapses the old planner + N worker "design" calls into ONE grammar-constrained
 * call that returns the whole analysis at once: a goal, a short reasoning string
 * (emitted FIRST — structure-before-values measurably helps small models), and flat
 * arrays of SQL specs, chart specs, and anomaly checks. Deterministic code then runs
 * the SQL/anomaly math (see ../compute.ts); the model never executes anything.
 *
 * The schema is intentionally flat (enums, arrays of flat objects, one nesting level)
 * so node-llama-cpp's native GBNF grammar can express it — small-model compliance
 * collapses when $defs/deep nesting appear.
 */

import { z } from "zod";
import type { InferenceScheduler } from "../scheduler";
import type { SwarmContext } from "../types";
import { chartTypeEnum, contextBlock } from "./base";

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
        type: chartTypeEnum,
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

export type AnalysisPlan = z.infer<typeof analysisPlanSchema>;

const SYSTEM = [
  "You are Moudir's analyst-planner. In ONE response design the WHOLE analysis.",
  "Output a goal, a short reasoning string, then:",
  "- sqlSpecs: each a single read-only DuckDB SELECT over the view, LIMIT <= 200, real columns only, no semicolons; give each a short id.",
  "- chartSpecs: each references a sqlSpec id and uses real columns for x / y (/ series).",
  "- anomalyChecks: each references a sqlSpec id and a kind (dip | spike | outlier | trend).",
  "Keep it minimal: at most 4 sql specs, 3 charts, 3 anomaly checks. Use ONLY real columns; never invent.",
].join(" ");

/** Tier 2, call #1: one grammar-constrained call returning the full plan + specs. */
export async function runAnalysisPlan(
  scheduler: InferenceScheduler,
  ctx: SwarmContext,
): Promise<AnalysisPlan> {
  const prompt = [
    contextBlock(ctx),
    ctx.userPrompt ? `Question: ${ctx.userPrompt}` : "",
    "Produce the analysis plan now: reasoning first, then the specs.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return scheduler.generateStructured(
    {
      model: ctx.model,
      system: SYSTEM,
      prompt,
      systemPrefix: contextBlock(ctx),
      maxTokens: 1024,
      temperature: 0,
    },
    analysisPlanSchema,
  );
}
