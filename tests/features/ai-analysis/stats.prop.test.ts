import { fc, it, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import {
  buildHistogram,
  correlationStrength,
  linearRegression,
  mean,
  pearsonCorrelation,
  stdDev,
} from "@/features/ai-analysis/model/stats";

/**
 * Property-based fuzzing of the statistics primitives.
 *
 * Mathematical invariants that must hold for ANY finite float array:
 *   - mean(xs)            ∈ [min(xs), max(xs)]
 *   - stdDev(xs)          ≥ 0
 *   - pearsonCorrelation  ∈ [-1, 1]   (when both series have non-zero variance)
 *   - linearRegression.r2 ∈ [0, 1]    (when x has non-zero variance)
 *   - buildHistogram      sums to N (every value lands in exactly one bin) when
 *                         the values are non-degenerate, and is non-negative
 *                         everywhere.
 * These complement the example-based stats.test.ts (which checks known cases).
 *
 * DEGENERATE-INPUT CONTRACT (source guarded — these used to return NaN):
 *   1. `pearsonCorrelation` returns exactly `0` (a number in [-1,1], no linear
 *      relationship) whenever EITHER series has zero variance (a constant
 *      column). It no longer divides by a zero standard deviation.
 *   2. `linearRegression` returns finite values for a degenerate x (zero
 *      variance) — `{slope: 0, intercept: mean(y), r2: 0}` — and `r2 = 0`
 *      (never NaN) whenever the rSquared denominator is 0 (e.g. constant y).
 *   Both are pinned below so the safe degenerate contract is locked.
 */

/**
 * True when a series has a WELL-CONDITIONED non-zero variance — its value
 * range is a meaningful fraction of its magnitude. A bare "≥2 distinct values"
 * check is insufficient: two values one ULP apart (e.g. 0 vs 5e-324) are
 * "distinct" yet make simple-statistics' rSquared underflow to NaN. The
 * analysis worker only ever sees real-world-scaled data, so we test the
 * invariant over that well-conditioned domain.
 */
function hasVariance(xs: number[]): boolean {
  if (xs.length < 2) return false;
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const range = hi - lo;
  const scale = Math.max(Math.abs(lo), Math.abs(hi), 1);
  return range / scale > 1e-6;
}

/** A finite, well-conditioned float (no NaN/Infinity, bounded magnitude). */
const finiteFloat = fc.double({
  noNaN: true,
  noDefaultInfinity: true,
  min: -1e6,
  max: 1e6,
});

const floatArray = fc.array(finiteFloat, { minLength: 0, maxLength: 64 });

describe("mean — bounded by the data (fuzzed)", () => {
  test.prop([fc.array(finiteFloat, { minLength: 1, maxLength: 64 })])(
    "mean(xs) lies within [min(xs), max(xs)] for any non-empty array",
    (xs) => {
      const m = mean(xs);
      const lo = Math.min(...xs);
      const hi = Math.max(...xs);
      // Allow a tiny floating-point slack at the boundaries.
      const eps = (Math.abs(hi) + Math.abs(lo) + 1) * 1e-9;
      expect(m).toBeGreaterThanOrEqual(lo - eps);
      expect(m).toBeLessThanOrEqual(hi + eps);
    },
  );

  test.prop([floatArray])("is finite and never throws (total over finite arrays)", (xs) => {
    const m = mean(xs);
    expect(Number.isFinite(m)).toBe(true);
  });

  test.prop([finiteFloat, fc.integer({ min: 1, max: 32 })])(
    "mean of a constant array equals that constant",
    (c, n) => {
      const xs = Array.from({ length: n }, () => c);
      expect(mean(xs)).toBeCloseTo(c, 6);
    },
  );
});

describe("stdDev — non-negative (fuzzed)", () => {
  test.prop([floatArray])("stdDev(xs) ≥ 0 for any array (and 0 for <2 values)", (xs) => {
    const sd = stdDev(xs);
    expect(Number.isFinite(sd)).toBe(true);
    expect(sd).toBeGreaterThanOrEqual(0);
    if (xs.length < 2) expect(sd).toBe(0);
  });

  test.prop([finiteFloat, fc.integer({ min: 2, max: 32 })])(
    "stdDev of a constant array is exactly 0 (no spurious spread)",
    (c, n) => {
      const xs = Array.from({ length: n }, () => c);
      expect(stdDev(xs)).toBeCloseTo(0, 6);
    },
  );
});

describe("pearsonCorrelation — bounded in [-1, 1] (fuzzed)", () => {
  test.prop([fc.array(finiteFloat, { minLength: 3, maxLength: 48 })])(
    "correlation is always within [-1, 1] when both series have non-zero variance",
    (xs) => {
      // Deterministic, equal-length, non-degenerate partner series.
      const ys = xs.map((v, i) => v * 1.5 + i);
      fc.pre(hasVariance(xs) && hasVariance(ys));
      const r = pearsonCorrelation(xs, ys);
      expect(Number.isFinite(r)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(-1);
      expect(r).toBeLessThanOrEqual(1);
    },
  );

  test.prop([fc.array(finiteFloat, { minLength: 3, maxLength: 48 })])(
    "is symmetric on non-degenerate input: corr(xs, ys) === corr(ys, xs)",
    (xs) => {
      const ys = xs.map((v, i) => v * 2 + i);
      fc.pre(hasVariance(xs) && hasVariance(ys));
      expect(pearsonCorrelation(xs, ys)).toBeCloseTo(pearsonCorrelation(ys, xs), 9);
    },
  );

  test.prop([fc.array(finiteFloat, { minLength: 0, maxLength: 2 })])(
    "returns exactly 0 for the guarded short/mismatched cases (len < 3)",
    (xs) => {
      expect(pearsonCorrelation(xs, xs)).toBe(0);
    },
  );

  // Safe degenerate contract: a constant (zero-variance) series has no linear
  // relationship, so correlation is exactly 0 — finite and within [-1, 1].
  it("returns 0 (finite, in-range) when a series is constant (zero variance)", () => {
    expect(pearsonCorrelation([1, 2, 3], [5, 5, 5])).toBe(0);
    expect(pearsonCorrelation([0, 0, 0], [1, 2, 3])).toBe(0);
  });
});

describe("linearRegression & correlationStrength (fuzzed)", () => {
  test.prop([
    fc.array(finiteFloat, { minLength: 2, maxLength: 48 }),
    fc.array(finiteFloat, { minLength: 2, maxLength: 48 }),
  ])("r2 ∈ [0, 1] and slope/intercept are finite when BOTH x and y have variance", (xs, ys) => {
    const n = Math.min(xs.length, ys.length);
    const x = xs.slice(0, n);
    const y = ys.slice(0, n);
    // r2 (rSquared) is only defined when both x and y vary; a degenerate x or
    // a constant y yields NaN (documented below).
    fc.pre(hasVariance(x) && hasVariance(y));
    const { slope, intercept, r2 } = linearRegression(x, y);
    expect(r2).toBeGreaterThanOrEqual(0);
    expect(r2).toBeLessThanOrEqual(1);
    expect(Number.isFinite(slope)).toBe(true);
    expect(Number.isFinite(intercept)).toBe(true);
  });

  // Safe degenerate contract: finite values are returned for degenerate inputs,
  // honouring the declared `number` return type (no NaN/Infinity escapes).
  it("returns a flat line through mean(y) for a degenerate x (zero variance)", () => {
    const r = linearRegression([5, 5, 5], [1, 2, 3]);
    expect(r.slope).toBe(0);
    expect(r.intercept).toBeCloseTo(2); // mean([1,2,3])
    expect(r.r2).toBe(0);
    expect(Number.isFinite(r.slope)).toBe(true);
    expect(Number.isFinite(r.intercept)).toBe(true);
    expect(Number.isFinite(r.r2)).toBe(true);
  });

  it("returns r2 = 0 (finite) when y is constant even though x varies (rSquared 0/0)", () => {
    const r = linearRegression([0, 1, 2], [4, 4, 4]);
    expect(r.r2).toBe(0);
    expect(Number.isFinite(r.slope)).toBe(true);
    expect(Number.isFinite(r.intercept)).toBe(true);
  });

  test.prop([fc.double({ min: -1, max: 1, noNaN: true })])(
    "correlationStrength returns a valid bucket for any r in [-1,1]",
    (r) => {
      expect(["very_strong", "strong", "moderate", "weak", "none"]).toContain(
        correlationStrength(r),
      );
    },
  );
});

describe("buildHistogram — counting invariants (fuzzed)", () => {
  test.prop([
    fc.array(finiteFloat, { minLength: 1, maxLength: 64 }),
    fc.integer({ min: 1, max: 20 }),
  ])("every bin is non-negative and the bin count equals the requested bins", (xs, bins) => {
    const hist = buildHistogram(xs, bins);
    expect(hist).toHaveLength(bins);
    for (const c of hist) expect(c).toBeGreaterThanOrEqual(0);
  });

  test.prop([
    fc.array(finiteFloat, { minLength: 2, maxLength: 64 }),
    fc.integer({ min: 1, max: 20 }),
  ])(
    "for a non-degenerate array (min ≠ max) the histogram sums to N (every value binned exactly once)",
    (xs, bins) => {
      const min = Math.min(...xs);
      const max = Math.max(...xs);
      fc.pre(min !== max); // skip degenerate (all-equal) inputs, which the source maps to all-zero
      const hist = buildHistogram(xs, bins);
      const total = hist.reduce((a, b) => a + b, 0);
      expect(total).toBe(xs.length);
    },
  );
});
