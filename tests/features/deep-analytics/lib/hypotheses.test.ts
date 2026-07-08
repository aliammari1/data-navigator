import { describe, it, expect } from "vitest";
import {
  buildHypothesisPrompt,
  deterministicHypothesis,
  HypothesisSchema,
  SYSTEM,
  type DiscrepancyInput,
} from "@/features/deep-analytics/lib/hypotheses";

/**
 * Unit tests for src/features/deep-analytics/lib/hypotheses.ts
 *
 * This module is pure logic (no IO / native / worker deps), so every exported
 * function and schema is exercised directly.  Each branch in both functions is
 * hit from both sides.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDiscrepancy(overrides: Partial<DiscrepancyInput> = {}): DiscrepancyInput {
  return {
    channel: "Mobile",
    expectedVol: 1000,
    actualVol: 1100,
    volVariancePct: 10,
    expectedRev: 5000,
    actualRev: 5500,
    revVariancePct: 10,
    isMaterial: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// HypothesisSchema
// ---------------------------------------------------------------------------

describe("HypothesisSchema", () => {
  it("accepts a valid hypotheses payload", () => {
    const raw = {
      hypotheses: [
        { channel: "Mobile", hypothesis: "A campaign inflated throughput." },
        { channel: "Web", hypothesis: "An outage reduced volume." },
      ],
    };
    const result = HypothesisSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it("rejects a payload missing the hypotheses array", () => {
    const result = HypothesisSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects a hypotheses entry missing the channel field", () => {
    const result = HypothesisSchema.safeParse({
      hypotheses: [{ hypothesis: "No channel" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a hypotheses entry missing the hypothesis field", () => {
    const result = HypothesisSchema.safeParse({
      hypotheses: [{ channel: "Mobile" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts an empty hypotheses array", () => {
    const result = HypothesisSchema.safeParse({ hypotheses: [] });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SYSTEM export
// ---------------------------------------------------------------------------

describe("SYSTEM", () => {
  it("is a non-empty string", () => {
    expect(typeof SYSTEM).toBe("string");
    expect(SYSTEM.length).toBeGreaterThan(0);
  });

  it("mentions payments reconciliation analyst role", () => {
    expect(SYSTEM).toContain("payments reconciliation analyst");
  });
});

// ---------------------------------------------------------------------------
// buildHypothesisPrompt
// ---------------------------------------------------------------------------

describe("buildHypothesisPrompt", () => {
  it("returns a string beginning with the fixed preamble", () => {
    const prompt = buildHypothesisPrompt([makeDiscrepancy()]);
    expect(prompt).toMatch(/^Produce a hypothesis for each of the following channel discrepancies:/);
  });

  it("includes '+' prefix when volVariancePct is positive", () => {
    const d = makeDiscrepancy({ volVariancePct: 5.0, revVariancePct: 3.0 });
    const prompt = buildHypothesisPrompt([d]);
    expect(prompt).toContain("volume +5.0%");
  });

  it("omits '+' prefix when volVariancePct is negative", () => {
    const d = makeDiscrepancy({ volVariancePct: -5.0, revVariancePct: 3.0 });
    const prompt = buildHypothesisPrompt([d]);
    expect(prompt).toContain("volume -5.0%");
    expect(prompt).not.toContain("volume +-");
  });

  it("uses '+' prefix when volVariancePct is exactly zero (>=0 branch)", () => {
    const d = makeDiscrepancy({ volVariancePct: 0, revVariancePct: 0 });
    const prompt = buildHypothesisPrompt([d]);
    expect(prompt).toContain("volume +0.0%");
  });

  it("includes '+' prefix when revVariancePct is positive", () => {
    const d = makeDiscrepancy({ volVariancePct: 1, revVariancePct: 7.0 });
    const prompt = buildHypothesisPrompt([d]);
    expect(prompt).toContain("revenue +7.0%");
  });

  it("omits '+' prefix when revVariancePct is negative", () => {
    const d = makeDiscrepancy({ volVariancePct: 1, revVariancePct: -3.5 });
    const prompt = buildHypothesisPrompt([d]);
    expect(prompt).toContain("revenue -3.5%");
  });

  it("appends [MATERIAL] tag when isMaterial is true", () => {
    const d = makeDiscrepancy({ isMaterial: true });
    const prompt = buildHypothesisPrompt([d]);
    expect(prompt).toContain("[MATERIAL]");
  });

  it("omits [MATERIAL] tag when isMaterial is false", () => {
    const d = makeDiscrepancy({ isMaterial: false });
    const prompt = buildHypothesisPrompt([d]);
    expect(prompt).not.toContain("[MATERIAL]");
  });

  it("includes the channel name in the output line", () => {
    const d = makeDiscrepancy({ channel: "POS Terminal" });
    const prompt = buildHypothesisPrompt([d]);
    expect(prompt).toContain("POS Terminal:");
  });

  it("includes expected and actual volumes rounded to integers", () => {
    const d = makeDiscrepancy({ expectedVol: 1234.7, actualVol: 987.3 });
    const prompt = buildHypothesisPrompt([d]);
    expect(prompt).toContain("expected 1235");
    expect(prompt).toContain("actual 987");
  });

  it("handles multiple discrepancies, one line each", () => {
    const discrepancies: DiscrepancyInput[] = [
      makeDiscrepancy({ channel: "Mobile", volVariancePct: 10, isMaterial: true }),
      makeDiscrepancy({ channel: "Web", volVariancePct: -2, isMaterial: false }),
    ];
    const prompt = buildHypothesisPrompt(discrepancies);
    const lines = prompt.split("\n");
    // First line is preamble, then one line per discrepancy
    expect(lines.length).toBe(3);
    expect(lines[1]).toContain("Mobile:");
    expect(lines[2]).toContain("Web:");
  });

  it("handles an empty discrepancy array", () => {
    const prompt = buildHypothesisPrompt([]);
    expect(prompt).toBe(
      "Produce a hypothesis for each of the following channel discrepancies:\n",
    );
  });
});

// ---------------------------------------------------------------------------
// deterministicHypothesis
// ---------------------------------------------------------------------------

describe("deterministicHypothesis", () => {
  // ---
  // NOT material branch — early return
  // ---

  describe("when isMaterial is false (early return)", () => {
    it("returns a 'within normal variance' message with '+' prefix for positive volVariancePct", () => {
      const d = makeDiscrepancy({ isMaterial: false, volVariancePct: 3.0 });
      const result = deterministicHypothesis(d);
      expect(result).toContain("within normal variance");
      expect(result).toContain("+3.0%");
      expect(result).toContain("No investigation required.");
    });

    it("returns a 'within normal variance' message with no '+' prefix for negative volVariancePct", () => {
      const d = makeDiscrepancy({ isMaterial: false, volVariancePct: -4.5 });
      const result = deterministicHypothesis(d);
      expect(result).toContain("within normal variance");
      expect(result).toContain("-4.5%");
      expect(result).not.toContain("+-");
    });

    it("uses '+' sign when volVariancePct is exactly 0 (>=0 branch)", () => {
      const d = makeDiscrepancy({ isMaterial: false, volVariancePct: 0 });
      const result = deterministicHypothesis(d);
      expect(result).toContain("+0.0%");
    });

    it("includes the channel name in the early-return message", () => {
      const d = makeDiscrepancy({ isMaterial: false, channel: "ATM", volVariancePct: 1 });
      const result = deterministicHypothesis(d);
      expect(result).toContain("ATM volume is within normal variance");
    });
  });

  // ---
  // Material branch
  // ---

  describe("when isMaterial is true", () => {
    it("says 'above expected' when volVariancePct is positive", () => {
      const d = makeDiscrepancy({ isMaterial: true, volVariancePct: 15.0, revVariancePct: 1 });
      const result = deterministicHypothesis(d);
      expect(result).toContain("above expected");
    });

    it("says 'below expected' when volVariancePct is negative", () => {
      const d = makeDiscrepancy({ isMaterial: true, volVariancePct: -8.0, revVariancePct: 1 });
      const result = deterministicHypothesis(d);
      expect(result).toContain("below expected");
    });

    it("says 'above expected' when volVariancePct is exactly 0 (>=0 branch)", () => {
      const d = makeDiscrepancy({ isMaterial: true, volVariancePct: 0, revVariancePct: 1 });
      const result = deterministicHypothesis(d);
      expect(result).toContain("above expected");
    });

    it("mentions campaign/backlog when volume variance is positive (>=0)", () => {
      const d = makeDiscrepancy({ isMaterial: true, volVariancePct: 12.0, revVariancePct: 1 });
      const result = deterministicHypothesis(d);
      expect(result).toContain("campaign or backlog");
    });

    it("mentions outage/migration when volume variance is negative", () => {
      const d = makeDiscrepancy({ isMaterial: true, volVariancePct: -12.0, revVariancePct: 1 });
      const result = deterministicHypothesis(d);
      expect(result).toContain("outage, migration");
    });

    it("uses the absolute value of volVariancePct for magnitude in the message", () => {
      const d = makeDiscrepancy({ isMaterial: true, volVariancePct: -7.25, revVariancePct: 1 });
      const result = deterministicHypothesis(d);
      expect(result).toContain("7.3% below expected");
    });

    // ---
    // revNote: revenue tracked expectations (abs(revVariancePct) <= 5)
    // ---

    it("says revenue tracked expectations when |revVariancePct| <= 5 (not > 5)", () => {
      const d = makeDiscrepancy({ isMaterial: true, volVariancePct: 10, revVariancePct: 5.0 });
      const result = deterministicHypothesis(d);
      expect(result).toContain("Revenue tracked expectations");
      expect(result).toContain("volume-only effect");
    });

    it("says revenue tracked expectations for zero revVariancePct", () => {
      const d = makeDiscrepancy({ isMaterial: true, volVariancePct: 10, revVariancePct: 0 });
      const result = deterministicHypothesis(d);
      expect(result).toContain("Revenue tracked expectations");
    });

    it("says revenue tracked expectations for small negative revVariancePct (abs = 3 <= 5)", () => {
      const d = makeDiscrepancy({ isMaterial: true, volVariancePct: 10, revVariancePct: -3.0 });
      const result = deterministicHypothesis(d);
      expect(result).toContain("Revenue tracked expectations");
    });

    // ---
    // revNote: revenue diverged (abs(revVariancePct) > 5)
    // ---

    it("mentions pricing/mix check when |revVariancePct| > 5 (positive revenue variance)", () => {
      const d = makeDiscrepancy({ isMaterial: true, volVariancePct: 10, revVariancePct: 8.0 });
      const result = deterministicHypothesis(d);
      expect(result).toContain("Revenue is up");
      expect(result).toContain("8.0%");
      expect(result).toContain("pricing/mix");
    });

    it("mentions revenue 'down' when revVariancePct is large negative (> 5 abs)", () => {
      const d = makeDiscrepancy({ isMaterial: true, volVariancePct: 10, revVariancePct: -9.5 });
      const result = deterministicHypothesis(d);
      expect(result).toContain("Revenue is down");
      expect(result).toContain("9.5%");
    });

    it("uses the channel name in the material-branch message", () => {
      const d = makeDiscrepancy({ isMaterial: true, channel: "USSD", volVariancePct: 5, revVariancePct: 1 });
      const result = deterministicHypothesis(d);
      expect(result).toContain("USSD volume is");
    });

    it("formats magnitude to one decimal place", () => {
      const d = makeDiscrepancy({ isMaterial: true, volVariancePct: 12.345, revVariancePct: 1 });
      const result = deterministicHypothesis(d);
      // toFixed(1) on 12.345 -> "12.3"
      expect(result).toContain("12.3%");
    });

    it("formats revVariancePct to one decimal place in revNote when > 5", () => {
      const d = makeDiscrepancy({ isMaterial: true, volVariancePct: 10, revVariancePct: 6.789 });
      const result = deterministicHypothesis(d);
      // Math.abs(6.789).toFixed(1) = "6.8"
      expect(result).toContain("6.8%");
    });
  });
});
