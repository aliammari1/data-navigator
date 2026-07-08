/**
 * Local LLM-as-judge helper.
 *
 * 2026 offline-eval best practice: use the SAME already-loaded local model to
 * self-critique generated text — no cloud judge, no API key, no network call.
 * This keeps the eval harness's zero-cloud-dependency guarantee (see
 * evals/README.md): the judge is just another `engine.generate()` call
 * through `_model.ts`'s `LocalEngine`, so it works fully offline like every
 * other live eval in this harness.
 *
 * This module has ONE extra runtime dependency beyond `_harness.ts`'s
 * zero-deps rule: a type-only import of `LocalEngine` from `_model.ts` (never
 * `node-llama-cpp` itself — that stays lazy inside `loadLocalEngine()`).
 * Everything else here is pure string handling.
 *
 * A 1.5B model's instruction-following is unreliable, so the score parse is
 * DEFENSIVE: a regex, not JSON (a tiny model asked for JSON under a judge
 * prompt frequently free-forms prose instead). Malformed judge output is
 * treated as a FAILED / LOWEST-possible judgment (score 1, `parsed: false`),
 * never a thrown exception — a broken judge should degrade the eval's signal,
 * not crash the whole suite. The raw text is always kept on the result so a
 * bad judgment is debuggable.
 */

import type { LocalEngine } from "./_model";

/** Inclusive lower bound of the judge's rating scale. */
export const JUDGE_MIN_SCORE = 1;
/** Inclusive upper bound of the judge's rating scale. */
export const JUDGE_MAX_SCORE = 5;

export interface JudgeCriteria {
  /** Name of the axis being judged, e.g. "coherence", "non-repetition", "topical relevance". */
  name: string;
  /** One or two sentences describing what a 5 vs. a 1 looks like — folded into the judge prompt. */
  guidance: string;
}

export interface JudgeResult {
  /**
   * Parsed 1-5 score. Set to {@link JUDGE_MIN_SCORE} (the LOWEST score, never
   * a crash) when the judge's raw output could not be parsed at all — a
   * malformed judgment is scored as a failure, not ignored.
   */
  score: number;
  /** The judge's stated reason, best-effort (empty string if absent/unparsable). */
  reason: string;
  /** The judge's raw, unparsed text — always kept for debugging a bad judgment. */
  raw: string;
  /** False when `raw` could not be parsed into a score at all. */
  parsed: boolean;
}

export interface JudgeInput {
  /** The generated text being judged. */
  text: string;
  /** The single criterion to score `text` on. */
  criteria: JudgeCriteria;
  /** Optional grounding context (e.g. the question or KPI set `text` should stay on-topic for). */
  context?: string;
  /** Generation budget for the judge call (small — it only needs to emit two lines). */
  maxTokens?: number;
}

const JUDGE_SYSTEM = [
  "You are a strict, terse evaluator grading a single piece of AI-generated text",
  "against ONE quality criterion. Respond in EXACTLY this two-line format and nothing else:",
  "SCORE: <integer 1-5>",
  "REASON: <one short sentence>",
].join(" ");

/**
 * Defensive regex-based parse of a judge's raw output. Never throws: a
 * malformed response yields `{ score: JUDGE_MIN_SCORE, parsed: false }` so a
 * caller can fold it into a mean/accuracy without special-casing crashes.
 */
export function parseJudgeOutput(raw: string): JudgeResult {
  const scoreMatch = raw.match(/SCORE:?\s*([1-5])\b/i);
  if (!scoreMatch) {
    return { score: JUDGE_MIN_SCORE, reason: "", raw, parsed: false };
  }

  const parsedScore = Number.parseInt(scoreMatch[1], 10);
  const score = Math.min(JUDGE_MAX_SCORE, Math.max(JUDGE_MIN_SCORE, parsedScore));

  const reasonMatch = raw.match(/REASON:?\s*(.+)/i);
  const reason = reasonMatch?.[1]?.trim() ?? "";

  return { score, reason, raw, parsed: true };
}

/**
 * Prompt the ALREADY-LOADED local engine to self-critique `input.text` on a
 * single criterion, 1 (worst) to 5 (best). Greedy decode (temperature 0) for
 * reproducibility. Never throws on a malformed judge response — see
 * {@link parseJudgeOutput}.
 */
export async function judgeCoherence(engine: LocalEngine, input: JudgeInput): Promise<JudgeResult> {
  const prompt = [
    `Criterion: ${input.criteria.name}`,
    `Guidance: ${input.criteria.guidance}`,
    input.context ? `Context: ${input.context}` : "",
    "Text to evaluate:",
    "---",
    input.text,
    "---",
    "Score the text above 1 (worst) to 5 (best) for the criterion. Use the exact SCORE/REASON format.",
  ]
    .filter(Boolean)
    .join("\n");

  const { text: raw } = await engine.generate({
    system: JUDGE_SYSTEM,
    prompt,
    maxTokens: input.maxTokens ?? 80,
    temperature: 0,
  });

  return parseJudgeOutput(raw);
}
