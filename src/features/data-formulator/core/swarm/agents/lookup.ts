"use client";

/**
 * Moudir AI — Tier 1 lookup agent.
 *
 * Answers a direct data lookup in ONE grammar-constrained call: the model writes a
 * single read-only SQL statement plus a headline + summary; we run the SQL and
 * return a finished result. No planner, no workers, no critic, no synthesizer.
 */

import { z } from "zod";
import type { InferenceScheduler } from "../scheduler";
import type { Artifact, SwarmContext, SwarmResult } from "../types";
import { assertReadOnlySql, contextBlock, runTableArtifact } from "./base";

const lookupSchema = z.object({
  sql: z.string().describe("A single read-only DuckDB SELECT/WITH, no semicolons."),
  headline: z.string(),
  summary: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
});

const SYSTEM = [
  "You are Moudir answering a direct data lookup in ONE step.",
  "Write ONE read-only DuckDB SELECT (optionally a leading WITH) over the single view in context.",
  "Use ONLY real columns; never invent. Always LIMIT <= 200. No semicolons, no DDL/DML.",
  "Then write a one-line headline and a tight summary of the answer.",
  "Reply in the user's language (English / French / Tunisian Derja).",
].join(" ");

const MAX_ATTEMPTS = 2;

/** Tier 1: answer a simple lookup with a SINGLE structured call + one SQL run. */
export async function runLookup(
  scheduler: InferenceScheduler,
  ctx: SwarmContext,
): Promise<SwarmResult> {
  const basePrompt = [
    contextBlock(ctx),
    ctx.userPrompt ? `Question: ${ctx.userPrompt}` : "",
    "Return the SQL, a headline, a summary, and your confidence.",
  ]
    .filter(Boolean)
    .join("\n\n");

  let lastError = "";
  let lastSql = "";

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const prompt =
      attempt === 0
        ? basePrompt
        : [
            basePrompt,
            "",
            `Your previous SQL failed: ${lastError}`,
            "Failing SQL:",
            lastSql,
            "Return corrected SQL.",
          ].join("\n");

    const parsed = await scheduler.generateStructured(
      {
        model: ctx.model,
        system: SYSTEM,
        prompt,
        systemPrefix: contextBlock(ctx),
        maxTokens: 1024,
        temperature: 0,
      },
      lookupSchema,
    );

    try {
      const sql = assertReadOnlySql(parsed.sql);
      const artifact: Artifact = await runTableArtifact(scheduler, "lookup", parsed.headline, sql);
      return {
        goal: ctx.userPrompt ?? parsed.headline,
        headline: parsed.headline.trim(),
        summary: parsed.summary.trim(),
        evidence: [],
        followUps: [],
        confidence: "rows" in artifact && artifact.rows.length === 0 ? "low" : parsed.confidence,
        artifacts: [artifact],
        modelUsed: ctx.model,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      lastSql = parsed.sql;
    }
  }

  throw new Error(`Lookup failed to produce a runnable query: ${lastError}\nSQL: ${lastSql}`);
}
