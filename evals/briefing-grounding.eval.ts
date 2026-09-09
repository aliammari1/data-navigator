/**
 * AI briefing grounding eval.
 *
 * The telecom briefing engine (src/platform/ai/report-ai.ts) turns numeric KPIs
 * (a `StatusSummary` + `ChannelStat[]`) into a manager-facing narrative. The
 * cardinal failure for a tiny offline model is HALLUCINATION — citing numbers the
 * input never contained (invented revenue, made-up percentages, phantom regions).
 *
 * This suite scores a briefing's grounding against its source figures:
 *   - groundedness: fraction of numeric claims that trace to a real input figure.
 *   - coverage:     fraction of key input figures the briefing actually surfaces.
 *   - overall:      0.8·groundedness + 0.2·coverage (hallucination dominates).
 *
 * DETERMINISTIC (the real gate, runs with NO model): the scorer is run over canned
 * well-grounded and deliberately-hallucinated briefings; we assert grounded ones
 * score high and hallucinated ones score low, with a clear margin between them.
 * Thresholds are calibrated to MEASURED behavior (see the comments on each assert),
 * pinned at/just below the observed scores so a regression in the scorer fails loud.
 *
 * LIVE (liveIt, auto-skips without a GGUF): generate a briefing over a synthetic
 * KPI set with the local engine and assert it clears a grounding floor.
 */

import { describe, expect, it } from "vitest";
import { assertAtLeast, mean, report } from "./_harness";
import { liveIt, loadLocalEngine } from "./_model";
import {
  BRIEFING_CASES,
  GROUNDED_CASES,
  HALLUCINATED_CASES,
  LIVE_KPIS,
} from "./fixtures/briefing-cases";
import {
  type BriefingKpis,
  extractNumericClaims,
  groundedFigures,
  scoreBriefingGrounding,
} from "./fixtures/briefing-grounding";

// ─── Calibrated thresholds (MEASURED, then pinned at/just below observed) ─────
//
// Observed on the canned fixtures (pnpm run test:eval):
//   grounded:     groundedness ∈ {1.000};  overall ∈ {0.800 … 1.000}
//   hallucinated: groundedness ≤ 0.500;     overall ≤ 0.467
//
// mean(grounded.overall)      = 0.960
// mean(hallucinated.overall)  = 0.250
// Every grounded overall (≥0.80) strictly beats every hallucinated overall (≤0.467).

/** Grounded briefings must, on average, be near-perfectly grounded. */
const GROUNDED_MEAN_OVERALL_MIN = 0.95; // observed 0.960
/** No grounded briefing may invent a metric: groundedness must be perfect. */
const GROUNDED_MIN_GROUNDEDNESS_MIN = 1.0; // observed min 1.000
/** Even the weakest grounded briefing clears this overall floor. */
const GROUNDED_MIN_OVERALL_MIN = 0.8; // observed min 0.800

/** Hallucinated briefings must, on average, score low overall. */
const HALLU_MEAN_OVERALL_MAX = 0.3; // observed 0.250
/** Even the "best" (most-anchored) hallucinated briefing stays capped here. */
const HALLU_MAX_GROUNDEDNESS_MAX = 0.55; // observed max 0.500
const HALLU_MAX_OVERALL_MAX = 0.5; // observed max 0.467

/** The grounded set must beat the hallucinated set by a wide, stable margin. */
const SEPARATION_MIN = 0.45; // observed 0.960 − 0.250 = 0.710

/** Floor the live-generated briefing must clear (conservative for a 1.5B model). */
const LIVE_GROUNDEDNESS_MIN = 0.6;

// ─── Deterministic: scorer unit behavior ─────────────────────────────────────

describe("briefing grounding · scorer (deterministic)", () => {
  it("extracts numeric claims incl. thousands separators and percentages", () => {
    const claims = extractNumericClaims(
      "10,000 transactions, 82.0% success, 8,200 ok, 800 failed.",
    );
    expect(claims).toEqual([10000, 82.0, 8200, 800]);
  });

  it("ignores the ISO report date so provenance is not a metric claim", () => {
    // The real briefing always stamps the date into the narrative.
    const claims = extractNumericClaims("On 2026-06-16, 500 transactions cleared.");
    expect(claims).toEqual([500]);
  });

  it("treats a briefing with no numbers as vacuously grounded", () => {
    const kpis: BriefingKpis = {
      status: { reussie: 9, annulation: 0, instance: 0, echec: 1, total: 10 },
      channels: [],
    };
    const score = scoreBriefingGrounding("Throughput held steady today.", kpis);
    expect(score.claimCount).toBe(0);
    expect(score.groundedness).toBe(1); // invents nothing
    expect(score.coverage).toBe(0); // …but surfaces nothing either
  });

  it("includes raw counts and derived rates as grounded figures", () => {
    const kpis: BriefingKpis = {
      status: { reussie: 82, annulation: 6, instance: 4, echec: 8, total: 100 },
      channels: [{ canal: "USSD", nombre: 52, montant: 1000 }],
    };
    const figs = groundedFigures(kpis);
    expect(figs).toContain(100); // total
    expect(figs).toContain(82); // success count
    expect(figs).toContain(82.0); // success rate %
    expect(figs).toContain(8.0); // failure rate %
    expect(figs).toContain(1000); // channel amount
  });

  it("flags an invented number as ungrounded", () => {
    const kpis: BriefingKpis = {
      status: { reussie: 90, annulation: 0, instance: 0, echec: 10, total: 100 },
      channels: [],
    };
    const score = scoreBriefingGrounding(
      "100 transactions, 90 succeeded, revenue was 4200 dollars.",
      kpis,
    );
    expect(score.ungrounded).toContain(4200);
    expect(score.groundedCount).toBe(2);
    expect(score.claimCount).toBe(3);
  });
});

// ─── Deterministic: grounded briefings score HIGH ────────────────────────────

describe("briefing grounding · grounded briefings score high (deterministic)", () => {
  it("scores every grounded briefing's groundedness at the calibrated minimum", () => {
    const grounded = GROUNDED_CASES.map((c) => scoreBriefingGrounding(c.text, c.kpis));
    for (const [i, s] of grounded.entries()) {
      report(`grounded[${i}].groundedness`, s.groundedness);
    }
    const minGroundedness = Math.min(...grounded.map((s) => s.groundedness));
    report("grounded.minGroundedness", minGroundedness);
    assertAtLeast(minGroundedness, GROUNDED_MIN_GROUNDEDNESS_MIN, "grounded.minGroundedness");
  });

  it("scores grounded briefings high on average and at the floor", () => {
    const overalls = GROUNDED_CASES.map((c) => scoreBriefingGrounding(c.text, c.kpis).overall);
    const meanOverall = mean(overalls);
    const minOverall = Math.min(...overalls);
    report("grounded.meanOverall", meanOverall);
    report("grounded.minOverall", minOverall);
    assertAtLeast(meanOverall, GROUNDED_MEAN_OVERALL_MIN, "grounded.meanOverall");
    assertAtLeast(minOverall, GROUNDED_MIN_OVERALL_MIN, "grounded.minOverall");
  });
});

// ─── Deterministic: hallucinated briefings score LOW ─────────────────────────

describe("briefing grounding · hallucinated briefings score low (deterministic)", () => {
  it("keeps every hallucinated briefing's groundedness below the cap", () => {
    const scores = HALLUCINATED_CASES.map((c) => scoreBriefingGrounding(c.text, c.kpis));
    for (const [i, s] of scores.entries()) {
      report(`hallucinated[${i}].groundedness`, s.groundedness);
    }
    const maxGroundedness = Math.max(...scores.map((s) => s.groundedness));
    report("hallucinated.maxGroundedness", maxGroundedness);
    // Assert the COMPLEMENT (1 − maxGroundedness) so we can reuse assertAtLeast:
    // a low cap on the worst case becomes a high floor on its complement.
    assertAtLeast(
      1 - maxGroundedness,
      1 - HALLU_MAX_GROUNDEDNESS_MAX,
      "hallucinated.maxGroundedness(inverted)",
    );
    expect(maxGroundedness).toBeLessThanOrEqual(HALLU_MAX_GROUNDEDNESS_MAX);
  });

  it("keeps hallucinated briefings low on average and at the worst case", () => {
    const overalls = HALLUCINATED_CASES.map((c) => scoreBriefingGrounding(c.text, c.kpis).overall);
    const meanOverall = mean(overalls);
    const maxOverall = Math.max(...overalls);
    report("hallucinated.meanOverall", meanOverall);
    report("hallucinated.maxOverall", maxOverall);
    assertAtLeast(
      1 - meanOverall,
      1 - HALLU_MEAN_OVERALL_MAX,
      "hallucinated.meanOverall(inverted)",
    );
    expect(meanOverall).toBeLessThanOrEqual(HALLU_MEAN_OVERALL_MAX);
    expect(maxOverall).toBeLessThanOrEqual(HALLU_MAX_OVERALL_MAX);
  });
});

// ─── Deterministic: the two classes are cleanly separable ────────────────────

describe("briefing grounding · classes are separable (deterministic)", () => {
  it("separates grounded from hallucinated by a wide margin", () => {
    const groundedMean = mean(
      GROUNDED_CASES.map((c) => scoreBriefingGrounding(c.text, c.kpis).overall),
    );
    const halluMean = mean(
      HALLUCINATED_CASES.map((c) => scoreBriefingGrounding(c.text, c.kpis).overall),
    );
    const separation = groundedMean - halluMean;
    report("separation", separation);
    assertAtLeast(separation, SEPARATION_MIN, "separation");
  });

  it("ranks every grounded briefing above every hallucinated one (overall)", () => {
    const groundedOveralls = GROUNDED_CASES.map(
      (c) => scoreBriefingGrounding(c.text, c.kpis).overall,
    );
    const halluOveralls = HALLUCINATED_CASES.map(
      (c) => scoreBriefingGrounding(c.text, c.kpis).overall,
    );
    const worstGrounded = Math.min(...groundedOveralls);
    const bestHallu = Math.max(...halluOveralls);
    report("worstGrounded", worstGrounded);
    report("bestHallucinated", bestHallu);
    // Threshold expressed as a metric: worstGrounded − bestHallu must be > 0.
    assertAtLeast(worstGrounded - bestHallu, 0.1, "grounded.worst − hallu.best");
    expect(worstGrounded).toBeGreaterThan(bestHallu);
  });

  it("covers every fixture (no orphaned cases)", () => {
    expect(BRIEFING_CASES.length).toBe(GROUNDED_CASES.length + HALLUCINATED_CASES.length);
    expect(GROUNDED_CASES.length).toBeGreaterThanOrEqual(4);
    expect(HALLUCINATED_CASES.length).toBeGreaterThanOrEqual(4);
  });
});

// ─── Live: generate a briefing with the local engine and score its grounding ──

describe("briefing grounding · live model (model-gated)", () => {
  liveIt("generates a grounded briefing over synthetic KPIs", async () => {
    const engine = await loadLocalEngine();
    try {
      await engine.ensureModel();

      const { status, channels } = LIVE_KPIS;
      const successRate = ((status.reussie / status.total) * 100).toFixed(1);
      const channelList = channels
        .map((c) => `${c.canal}: ${c.nombre} txns, ${c.montant} amount`)
        .join("; ");

      // Mirror report-ai.ts's prompt shape: feed the model the exact figures and
      // ask for a short narrative. A grounded model echoes these numbers; a
      // hallucinating one invents new ones (which the scorer will catch).
      const prompt =
        `Total: ${status.total}, ` +
        `Success: ${status.reussie} (${successRate}%), ` +
        `Cancellations: ${status.annulation}, ` +
        `In-progress: ${status.instance}, ` +
        `Failed: ${status.echec}. ` +
        `Top channels: ${channelList}. ` +
        "Write a 2-3 sentence telecom analyst briefing using ONLY these numbers.";

      const { text } = await engine.generate({
        system:
          "You are a telecom analyst. Summarize the daily transaction report in 2-3 sentences. " +
          "Use ONLY the numbers given — never invent figures, revenue, growth rates, or regions.",
        prompt,
        maxTokens: 220,
        temperature: 0,
      });

      const score = scoreBriefingGrounding(text, LIVE_KPIS);
      report("live.briefing.text.length", text.trim().length);
      report("live.briefing.claimCount", score.claimCount);
      report("live.briefing.groundedness", score.groundedness);
      report("live.briefing.overall", score.overall);

      // The model must produce a non-trivial briefing…
      expect(text.trim().length).toBeGreaterThan(0);
      // …and it must be well-grounded: most numeric claims trace to the inputs.
      assertAtLeast(score.groundedness, LIVE_GROUNDEDNESS_MIN, "live.briefing.groundedness");
    } finally {
      await engine.dispose();
    }
  });
});
