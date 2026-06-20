"use client";

/**
 * Moudir AI — Tier 2, call #2: NARRATE + VERIFY.
 *
 * One grammar-constrained call that writes the manager-facing answer AND self-checks
 * it against the REAL queried rows — folding the old synthesizer and critic into a
 * single pass. Confidence is made mechanical (capped to "low" if the model claims it
 * used real data but no rows exist), so a small model cannot rubber-stamp itself.
 */

import { z } from "zod";
import { buildJsonInstruction, parseStructured } from "@/platform/ai/provider/structured";
import type { InferenceScheduler } from "../scheduler";
import type { Artifact, SwarmContext, SwarmResult } from "../types";
import { artifactEvidence, contextBlock } from "./base";

const answerSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  evidence: z.array(z.string()),
  followUps: z.array(z.string()),
  confidence: z.enum(["low", "medium", "high"]),
  usedRealData: z.boolean(),
});

const SYSTEM = [
  "You are Moudir writing the final manager answer from REAL queried data.",
  "Cite the actual numbers from the Findings — never invent or round them away.",
  'Set usedRealData=false and confidence="low" if the Findings say nothing was retrieved.',
  "Reply in the user's language (English / French / Tunisian Derja).",
].join(" ");

type AnswerShape = z.infer<typeof answerSchema>;

/** Shape the validated model output into the final, mechanically-corrected result. */
function toResult(
  out: AnswerShape,
  goal: string,
  artifacts: Artifact[],
  model: string,
): SwarmResult {
  const hasData = artifacts.some(
    (a) => (a.kind === "table" || a.kind === "chart") && a.rows.length > 0,
  );

  return {
    goal,
    headline: out.headline.trim(),
    summary: out.summary.trim(),
    evidence: out.evidence.map((e) => e.trim()).filter(Boolean),
    followUps: out.followUps.map((f) => f.trim()).filter(Boolean),
    // Mechanical confidence: never trust "high" when there is no real data behind it.
    confidence: out.usedRealData && !hasData ? "low" : out.confidence,
    artifacts,
    modelUsed: model,
  };
}

/**
 * Tier 2, call #2: the final structured, self-verified answer over real artifacts.
 *
 * When `onToken` is provided we stream a free-form `generate` (the only lane that
 * emits tokens — grammar-constrained `generateStructured` resolves in one shot),
 * appending a JSON-only instruction and validating the streamed text against the
 * same schema with the established prompt+repair parser. The answer prose lands
 * in the UI token-by-token instead of after a full multi-hundred-token wait, and
 * the returned `SwarmResult` shape is identical to the non-streamed path. Without
 * `onToken` we keep the grammar-constrained call (valid by construction).
 */
export async function runAnswer(
  scheduler: InferenceScheduler,
  ctx: SwarmContext,
  goal: string,
  artifacts: Artifact[],
  onToken?: (token: string) => void,
): Promise<SwarmResult> {
  const prompt = [
    contextBlock(ctx),
    ctx.userPrompt ? `User's question (match its language): ${ctx.userPrompt}` : "",
    `Goal: ${goal}`,
    artifactEvidence(artifacts),
    "Write the final structured answer; ground every claim strictly in the Findings.",
  ]
    .filter(Boolean)
    .join("\n\n");

  // The grammar-constrained, valid-by-construction path — also the fallback when
  // a streamed (non-constrained) answer fails to parse.
  const structured = () =>
    scheduler.generateStructured(
      {
        model: ctx.model,
        system: SYSTEM,
        prompt,
        systemPrefix: contextBlock(ctx),
        maxTokens: 700,
        temperature: 0.2,
      },
      answerSchema,
    );

  if (onToken) {
    try {
      const text = await scheduler.generate({
        model: ctx.model,
        system: [SYSTEM, buildJsonInstruction()].filter(Boolean).join("\n\n"),
        prompt,
        systemPrefix: contextBlock(ctx),
        maxTokens: 700,
        temperature: 0.2,
        onToken,
      });
      return toResult(
        parseStructured(text, answerSchema, { label: "moudir-answer" }),
        goal,
        artifacts,
        ctx.model,
      );
    } catch (err) {
      // If the run was cancelled, propagate — don't burn a retry on an aborted run.
      if (scheduler.signal.aborted) throw err;
      // A small model occasionally streams malformed JSON; re-run once through the
      // grammar lane so the user still gets a valid, correctly-shaped answer.
      return toResult(await structured(), goal, artifacts, ctx.model);
    }
  }

  return toResult(await structured(), goal, artifacts, ctx.model);
}
