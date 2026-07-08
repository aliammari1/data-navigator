/**
 * narrative-quality eval — local LLM-as-judge over generated telecom
 * narratives / data-formulator insights.
 *
 * IMPORTANT — WHY MOST OF THIS FILE IS LIVE-ONLY:
 * "Ask a model to judge a piece of text" has no meaningful deterministic
 * version — the judgment IS a model call. Unlike `swarm-safety.eval.ts` or
 * `briefing-grounding.eval.ts` (which score against a PURE, deterministic
 * function), there is no pure scorer to gate here without a model in the
 * loop. So the describe blocks that actually invoke {@link judgeCoherence}
 * are wrapped in `liveDescribe` (see `evals/perf/throughput.eval.ts` for the
 * same pattern) and auto-skip cleanly when no GGUF is installed. We do NOT
 * fake a deterministic gate for "the judge's opinion of this text".
 *
 * The ONE exception: {@link parseJudgeOutput} (in `_judge.ts`) IS a pure,
 * deterministic string parser — regex-based, not JSON, because a 1.5B
 * model's instruction-following is unreliable. THAT function's defensive
 * behavior (malformed judge output -> lowest score, never a crash) is a real,
 * testable, model-free contract, so it gets its own small deterministic
 * block below, same as `briefing-grounding.eval.ts` unit-tests its pure
 * scorer before the live blocks. This is not "faking" a gate for the judging
 * itself — it is gating the harness helper's parsing robustness, which is a
 * separate, legitimate concern.
 *
 * The live blocks test TWO things:
 *   1. Judge self-consistency (guards the JUDGE, not the thing being judged):
 *      an obviously-coherent, on-topic sample must score higher than an
 *      obviously-incoherent/repetitive/off-topic one. Mirrors
 *      `briefing-grounding.eval.ts`'s "grounded beats hallucinated" pattern.
 *   2. A live-generated telecom briefing narrative, judged for coherence and
 *      topical relevance to the KPI set that produced it.
 *
 * Thresholds here are NOT empirically measured in this repo session (no
 * local GGUF was present under DN_MODEL_DIR / <userData>/models/llm at the
 * time this eval was written) — they are conservative sanity floors, in the
 * same spirit as `perf/throughput.eval.ts`'s "sanity bounds only, never a
 * tuned threshold" philosophy for a live, model/machine-dependent eval.
 * Re-run `pnpm run test:eval:live` with a model installed to get REAL
 * measured numbers and tighten these floors accordingly.
 */

import { describe, expect, it } from "vitest";
import { assertAtLeast, report } from "./_harness";
import {
  JUDGE_MAX_SCORE,
  JUDGE_MIN_SCORE,
  type JudgeCriteria,
  judgeCoherence,
  parseJudgeOutput,
} from "./_judge";
import { liveDescribe, liveIt, loadLocalEngine } from "./_model";

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic: parseJudgeOutput's defensive parsing (pure, no model).
// ─────────────────────────────────────────────────────────────────────────────
describe("narrative quality · parseJudgeOutput (deterministic, no model)", () => {
  it("parses the canonical SCORE/REASON format", () => {
    const result = parseJudgeOutput("SCORE: 4\nREASON: Fluent and on-topic.");
    expect(result).toEqual({
      score: 4,
      reason: "Fluent and on-topic.",
      raw: "SCORE: 4\nREASON: Fluent and on-topic.",
      parsed: true,
    });
  });

  it("is tolerant of minor formatting drift (lowercase, extra whitespace, leading prose)", () => {
    const result = parseJudgeOutput("Sure!\nscore:   5\nreason:   Great, clear, and grounded.");
    expect(result.parsed).toBe(true);
    expect(result.score).toBe(5);
    expect(result.reason).toBe("Great, clear, and grounded.");
  });

  it("clamps an out-of-range digit rather than propagating it (score stays within [1,5])", () => {
    // "SCORE: 1" through "SCORE: 5" is all the regex accepts by construction
    // (character class [1-5]) — a value like "0" or "9" simply fails to
    // match at all, which is exercised by the malformed-output case below.
    const result = parseJudgeOutput("SCORE: 5\nREASON: n/a");
    expect(result.score).toBeLessThanOrEqual(JUDGE_MAX_SCORE);
    expect(result.score).toBeGreaterThanOrEqual(JUDGE_MIN_SCORE);
  });

  it("treats malformed judge output as a FAILED / LOWEST score, never a crash", () => {
    const malformed = "I think this piece of writing is pretty good, maybe a 4 out of 5?";
    expect(() => parseJudgeOutput(malformed)).not.toThrow();
    const result = parseJudgeOutput(malformed);
    expect(result.parsed).toBe(false);
    expect(result.score).toBe(JUDGE_MIN_SCORE);
    expect(result.reason).toBe("");
    // The raw text is ALWAYS kept, even (especially) when unparsable, so a
    // bad judgment stays debuggable.
    expect(result.raw).toBe(malformed);
  });

  it("keeps the raw text on a well-formed result too (always available for debugging)", () => {
    const raw = "SCORE: 3\nREASON: Somewhat repetitive.";
    expect(parseJudgeOutput(raw).raw).toBe(raw);
  });

  it("defaults an empty/absent REASON line to an empty string rather than throwing", () => {
    const result = parseJudgeOutput("SCORE: 2");
    expect(result.parsed).toBe(true);
    expect(result.score).toBe(2);
    expect(result.reason).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Live: judge self-consistency sanity check (guards the JUDGE, not the text).
// ─────────────────────────────────────────────────────────────────────────────

const COHERENCE_CRITERIA: JudgeCriteria = {
  name: "coherence and topical relevance",
  guidance:
    "5 = fluent, on-topic, non-repetitive analysis of telecom transaction data. " +
    "1 = incoherent, repetitive, or entirely off-topic text.",
};

/** Deterministic (no Math.random/Date.now), obviously coherent & on-topic. */
const COHERENT_SAMPLE =
  "USSD led all channels with 5,200 of the day's 10,000 transactions (52%), while App " +
  "followed with 3,100 (31%) and Web trailed at 1,700 (17%). Overall throughput held at " +
  "an 82% success rate, with the 8% failure rate concentrated on the Web channel during " +
  "the afternoon peak.";

/** Deterministic, obviously incoherent/repetitive/off-topic. */
const INCOHERENT_SAMPLE =
  "banana banana banana the the the weather weather is is nice nice today today purple " +
  "elephant seventeen seventeen seventeen unrelated unrelated topic topic sausage.";

/** Conservative margin floor — see the file-level note on unmeasured live thresholds. */
const SELF_CONSISTENCY_MARGIN_MIN = 0.5;

liveDescribe("narrative quality · judge self-consistency (live, model-gated)", () => {
  liveIt(
    "scores an obviously-coherent, on-topic sample higher than an obviously-incoherent one",
    async () => {
      const engine = await loadLocalEngine();
      try {
        await engine.ensureModel();

        const coherent = await judgeCoherence(engine, {
          text: COHERENT_SAMPLE,
          criteria: COHERENCE_CRITERIA,
        });
        const incoherent = await judgeCoherence(engine, {
          text: INCOHERENT_SAMPLE,
          criteria: COHERENCE_CRITERIA,
        });

        report("narrative-quality.judge.coherentScore", coherent.score);
        report("narrative-quality.judge.incoherentScore", incoherent.score);
        report("narrative-quality.judge.selfConsistencyMargin", coherent.score - incoherent.score);

        // The judge itself must have produced a PARSEABLE verdict for both —
        // an unparsable judgment on either sample means the judge is not
        // trustworthy enough to use as a quality gate at all.
        expect(coherent.parsed, `coherent judge raw: ${coherent.raw}`).toBe(true);
        expect(incoherent.parsed, `incoherent judge raw: ${incoherent.raw}`).toBe(true);

        assertAtLeast(
          coherent.score - incoherent.score,
          SELF_CONSISTENCY_MARGIN_MIN,
          "judge.selfConsistencyMargin",
        );
        expect(coherent.score).toBeGreaterThan(incoherent.score);
      } finally {
        await engine.dispose();
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Live: judge a REAL, model-generated telecom briefing narrative.
// ─────────────────────────────────────────────────────────────────────────────

/** Conservative floor for a live-generated briefing's coherence score. */
const LIVE_BRIEFING_SCORE_MIN = 3;

liveDescribe("narrative quality · live-generated telecom briefing (live, model-gated)", () => {
  liveIt("judges a model-generated briefing for coherence and topical relevance", async () => {
    const engine = await loadLocalEngine();
    try {
      await engine.ensureModel();

      const kpiContext =
        "Total: 10,000 transactions. Success: 8,200 (82.0%). Failed: 800 (8.0%). " +
        "Top channels: USSD 5,200 txns; App 3,100 txns; Web 1,700 txns.";

      const { text: narrative } = await engine.generate({
        system:
          "You are a telecom analyst. Summarize the daily transaction report in 2-3 " +
          "sentences, using ONLY the numbers given.",
        prompt: `${kpiContext}\nWrite a 2-3 sentence telecom analyst briefing using ONLY these numbers.`,
        maxTokens: 220,
        temperature: 0,
      });

      expect(narrative.trim().length).toBeGreaterThan(0);

      const verdict = await judgeCoherence(engine, {
        text: narrative,
        criteria: COHERENCE_CRITERIA,
        context: `The briefing should stay on-topic for these KPIs: ${kpiContext}`,
      });

      report("narrative-quality.live.briefingScore", verdict.score);
      report("narrative-quality.live.briefingJudgeParsed", verdict.parsed ? 1 : 0);

      // The judge must at least produce a parseable verdict; if it can't,
      // that is itself a finding worth surfacing rather than silently
      // averaging in a lowest-score placeholder.
      expect(verdict.parsed, `judge raw: ${verdict.raw}`).toBe(true);
      assertAtLeast(verdict.score, LIVE_BRIEFING_SCORE_MIN, "live.briefingScore");
    } finally {
      await engine.dispose();
    }
  });
});
