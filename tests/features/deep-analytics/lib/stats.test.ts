import { describe, expect, it, vi } from "vitest";
import {
  safeCorrelation,
  significanceFromP,
  studentTTwoSidedP,
  welchTTest,
} from "@/features/deep-analytics/lib/stats";

/**
 * Behavioral suite for the deep-analytics statistics helpers.
 *
 * The module is pure math (no IO / native / worker boundaries), so every
 * function is exercised directly. Expected numeric values were derived from the
 * installed `simple-statistics` plus the module's own Student-t implementation
 * and cross-checked against the t-distribution (e.g. 2*pt(-2,10)=0.073388 in R).
 */

describe("studentTTwoSidedP", () => {
  it("returns the maximal p-value (1) for t = 0 (means coincide)", () => {
    // Arrange / Act
    const p = studentTTwoSidedP(0, 10);
    // Assert — at t=0 the two-sided tail covers the whole distribution.
    expect(p).toBeCloseTo(1, 10);
  });

  it("matches the t-distribution tail for a moderate statistic (t=2, df=10)", () => {
    // R reference: 2 * pt(-2, 10) = 0.0733880
    expect(studentTTwoSidedP(2, 10)).toBeCloseTo(0.0733880, 6);
  });

  it("is symmetric in the sign of t", () => {
    expect(studentTTwoSidedP(-2, 10)).toBeCloseTo(studentTTwoSidedP(2, 10), 12);
  });

  it("returns ~0.05 at the classic two-sided 95% critical value (t=2.262, df=9)", () => {
    expect(studentTTwoSidedP(2.262, 9)).toBeCloseTo(0.05, 3);
  });

  it("drives the p-value toward zero for a large statistic", () => {
    const p = studentTTwoSidedP(10, 20);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1e-6);
  });

  it("returns 1 (not 0) for an infinite t — the non-finite guard short-circuits before the tail math", () => {
    // Documents the guard ordering: Number.isFinite(t) is checked first, so an
    // infinite statistic is treated as "no information" rather than p≈0.
    expect(studentTTwoSidedP(Number.POSITIVE_INFINITY, 10)).toBe(1);
    expect(studentTTwoSidedP(Number.NEGATIVE_INFINITY, 10)).toBe(1);
  });

  it("returns 1 for a NaN statistic", () => {
    expect(studentTTwoSidedP(Number.NaN, 10)).toBe(1);
  });

  it("returns 1 for a non-finite df", () => {
    expect(studentTTwoSidedP(2, Number.POSITIVE_INFINITY)).toBe(1);
    expect(studentTTwoSidedP(2, Number.NaN)).toBe(1);
  });

  it("returns 1 for df <= 0 (zero and negative degrees of freedom)", () => {
    expect(studentTTwoSidedP(2, 0)).toBe(1);
    expect(studentTTwoSidedP(2, -5)).toBe(1);
  });

  it("always returns a probability clamped to [0, 1]", () => {
    for (const t of [0, 0.5, 1, 3, 25, -7]) {
      for (const df of [1, 3, 8, 50]) {
        const p = studentTTwoSidedP(t, df);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("welchTTest", () => {
  it("returns null when either sample has fewer than two finite values", () => {
    expect(welchTTest([], [1, 2, 3])).toBeNull();
    expect(welchTTest([1], [1, 2, 3])).toBeNull();
    expect(welchTTest([1, 2, 3], [5])).toBeNull();
    expect(welchTTest([], [])).toBeNull();
  });

  it("filters non-finite values before counting, so NaN/Infinity can drop a sample below the minimum", () => {
    // a collapses to a single finite value ([7]) after filtering -> null.
    expect(welchTTest([7, Number.NaN, Number.POSITIVE_INFINITY], [1, 2, 3])).toBeNull();
  });

  it("ignores NaN/Infinity entries when both samples still have >=2 finite values", () => {
    const withGarbage = welchTTest(
      [5, 6, 7, 8, 9, Number.NaN, Number.POSITIVE_INFINITY],
      [1, 2, 3, 4, 5, Number.NEGATIVE_INFINITY],
    );
    const clean = welchTTest([5, 6, 7, 8, 9], [1, 2, 3, 4, 5]);
    expect(withGarbage).not.toBeNull();
    expect(clean).not.toBeNull();
    expect(withGarbage?.t).toBeCloseTo(clean?.t as number, 12);
    expect(withGarbage?.meanDiff).toBeCloseTo(clean?.meanDiff as number, 12);
  });

  it("computes the known Welch statistic for two equal-variance samples", () => {
    // A=[5..9], B=[1..5]: meanA=7, meanB=3, varA=varB=2.5, se=1, t=4, df=8.
    const r = welchTTest([5, 6, 7, 8, 9], [1, 2, 3, 4, 5]);
    expect(r).not.toBeNull();
    expect(r?.t).toBeCloseTo(4, 12);
    expect(r?.df).toBeCloseTo(8, 12);
    expect(r?.meanDiff).toBeCloseTo(4, 12);
    expect(r?.p).toBeCloseTo(0.00394977, 6);
  });

  it("builds a 95% CI from the z≈1.96 critical value at the default alpha", () => {
    // se=1, meanDiff=4 -> CI = 4 ± 1.96.
    const r = welchTTest([5, 6, 7, 8, 9], [1, 2, 3, 4, 5]);
    expect(r?.ci[0]).toBeCloseTo(4 - 1.96, 10);
    expect(r?.ci[1]).toBeCloseTo(4 + 1.96, 10);
  });

  it("flags significance when p < alpha (default alpha=0.05)", () => {
    const r = welchTTest([5, 6, 7, 8, 9], [1, 2, 3, 4, 5]);
    // p≈0.00395 < 0.05
    expect(r?.significant).toBe(true);
  });

  it("widens the CI and re-evaluates significance for a stricter alpha (0.01 -> z=2.576)", () => {
    const r = welchTTest([5, 6, 7, 8, 9], [1, 2, 3, 4, 5], 0.01);
    expect(r?.ci[0]).toBeCloseTo(4 - 2.576, 10);
    expect(r?.ci[1]).toBeCloseTo(4 + 2.576, 10);
    // p≈0.00395 < 0.01 -> still significant
    expect(r?.significant).toBe(true);
  });

  it("uses the z=1.645 critical value for a loose alpha (>0.05, e.g. 0.10)", () => {
    const r = welchTTest([5, 6, 7, 8, 9], [1, 2, 3, 4, 5], 0.1);
    expect(r?.ci[0]).toBeCloseTo(4 - 1.645, 10);
    expect(r?.ci[1]).toBeCloseTo(4 + 1.645, 10);
  });

  it("treats an alpha below the 0.01 ceiling as the 2.576 branch (e.g. alpha=0.001), yet not-significant when p >= alpha", () => {
    const r = welchTTest([5, 6, 7, 8, 9], [1, 2, 3, 4, 5], 0.001);
    // zCrit branch is alpha<=0.01 -> 2.576
    expect(r?.ci[0]).toBeCloseTo(4 - 2.576, 10);
    // p≈0.00395 is NOT < 0.001 -> not significant
    expect(r?.significant).toBe(false);
  });

  it("returns a zero-difference, p=1 result for two identical samples", () => {
    const r = welchTTest([2, 4, 6, 8], [2, 4, 6, 8]);
    expect(r).not.toBeNull();
    expect(r?.t).toBe(0);
    expect(r?.meanDiff).toBe(0);
    expect(r?.p).toBeCloseTo(1, 10);
    expect(r?.significant).toBe(false);
  });

  it("returns null when the pooled standard error is zero (both samples constant)", () => {
    // varA = varB = 0 -> se = 0 -> guarded null (avoids divide-by-zero in t).
    expect(welchTTest([3, 3, 3, 3], [3, 3, 3, 3])).toBeNull();
    // Same group means but both constant: still se=0 -> null.
    expect(welchTTest([5, 5, 5], [5, 5, 5])).toBeNull();
  });

  it("handles one constant and one varying sample (se > 0, finite t/df)", () => {
    const r = welchTTest([3, 3, 3, 3], [1, 2, 3, 4]);
    expect(r).not.toBeNull();
    expect(r?.meanDiff).toBeCloseTo(0.5, 12);
    expect(r?.t).toBeCloseTo(0.7745966692, 8);
    expect(r?.df).toBeCloseTo(3, 12);
    expect(Number.isFinite(r?.p as number)).toBe(true);
    // p≈0.495 is large -> not significant.
    expect(r?.significant).toBe(false);
  });

  it("produces a negative t and negative meanDiff when sample a < sample b", () => {
    const r = welchTTest([1, 2, 3, 4, 5], [5, 6, 7, 8, 9]);
    expect(r?.t).toBeCloseTo(-4, 12);
    expect(r?.meanDiff).toBeCloseTo(-4, 12);
    // CI brackets the (negative) mean difference.
    expect(r?.ci[0]).toBeLessThan(r?.ci[1] as number);
  });
});

describe("significanceFromP", () => {
  it("reports insufficient data for null / undefined / NaN p-values", () => {
    expect(significanceFromP(null)).toEqual({
      label: "Insufficient data",
      color: "text-slate-400",
    });
    expect(significanceFromP(undefined)).toEqual({
      label: "Insufficient data",
      color: "text-slate-400",
    });
    expect(significanceFromP(Number.NaN)).toEqual({
      label: "Insufficient data",
      color: "text-slate-400",
    });
  });

  it("labels p < 0.01 as highly significant", () => {
    expect(significanceFromP(0.005)).toEqual({
      label: "Highly significant (p<0.01)",
      color: "text-emerald-400",
    });
    expect(significanceFromP(0)).toEqual({
      label: "Highly significant (p<0.01)",
      color: "text-emerald-400",
    });
  });

  it("labels 0.01 <= p < 0.05 as significant", () => {
    expect(significanceFromP(0.03)).toEqual({
      label: "Significant (p<0.05)",
      color: "text-yellow-400",
    });
  });

  it("labels 0.05 <= p < 0.10 as marginal", () => {
    expect(significanceFromP(0.07)).toEqual({
      label: "Marginal (p<0.10)",
      color: "text-orange-400",
    });
  });

  it("labels p >= 0.10 as not significant", () => {
    expect(significanceFromP(0.2)).toEqual({
      label: "Not significant",
      color: "text-slate-400",
    });
    expect(significanceFromP(1)).toEqual({
      label: "Not significant",
      color: "text-slate-400",
    });
  });

  it("uses strict < at each boundary (thresholds fall into the next-looser bucket)", () => {
    // Exactly 0.01 is NOT < 0.01 -> "Significant" (next bucket).
    expect(significanceFromP(0.01).label).toBe("Significant (p<0.05)");
    // Exactly 0.05 is NOT < 0.05 -> "Marginal".
    expect(significanceFromP(0.05).label).toBe("Marginal (p<0.10)");
    // Exactly 0.10 is NOT < 0.10 -> "Not significant".
    expect(significanceFromP(0.1).label).toBe("Not significant");
  });

  it("does not special-case out-of-range or negative p-values (only the finite buckets apply)", () => {
    // A negative number is finite and < 0.01 -> highly significant bucket.
    expect(significanceFromP(-0.5).label).toBe("Highly significant (p<0.01)");
  });
});

describe("safeCorrelation", () => {
  it("returns 0 for mismatched lengths", () => {
    expect(safeCorrelation([1, 2, 3], [1, 2])).toBe(0);
  });

  it("returns 0 for inputs shorter than two points", () => {
    expect(safeCorrelation([], [])).toBe(0);
    expect(safeCorrelation([1], [1])).toBe(0);
  });

  it("recovers a perfect positive correlation (+1)", () => {
    expect(safeCorrelation([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 10);
  });

  it("recovers a perfect negative correlation (-1)", () => {
    expect(safeCorrelation([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 10);
  });

  it("returns 0 (not NaN) when a series is constant — the finite guard catches zero variance", () => {
    // sampleCorrelation yields NaN for a zero-variance series; the guard maps it to 0.
    expect(safeCorrelation([1, 2, 3], [5, 5, 5])).toBe(0);
    expect(safeCorrelation([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it("returns a value strictly inside (-1, 1) for an imperfect relationship", () => {
    const r = safeCorrelation([1, 2, 3, 4, 5], [2, 1, 4, 3, 6]);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(1);
  });

  it("returns 0 when sampleCorrelation throws (catch branch, line 180)", async () => {
    // vi.mock is hoisted and cannot be used safely inside a test body without
    // affecting other tests.  Use vi.doMock (not hoisted) + vi.resetModules to
    // load an isolated module instance that sees the throwing stub.
    vi.resetModules();
    vi.doMock("simple-statistics", async (importOriginal) => {
      const actual = await importOriginal<typeof import("simple-statistics")>();
      return {
        ...actual,
        sampleCorrelation: (): number => {
          throw new Error("synthetic sampleCorrelation failure");
        },
      };
    });
    const { safeCorrelation: sc } = await import("@/features/deep-analytics/lib/stats");
    expect(sc([1, 2, 3], [4, 5, 6])).toBe(0);
    vi.doUnmock("simple-statistics");
    vi.resetModules();
  });
});

describe("studentTTwoSidedP — logGamma x<0.5 branch", () => {
  it("exercises the logGamma(x<0.5) reflection path via a fractional df (0<df<1)", () => {
    // When df=0.5, incompleteBeta is called with a=df/2=0.25.
    // logGamma(0.25) triggers the x<0.5 branch (line 26) via recursion
    // logGamma(1-0.25)=logGamma(0.75).
    // The function must still return a clamped probability in [0,1].
    const p = studentTTwoSidedP(1, 0.5);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
    expect(Number.isFinite(p)).toBe(true);
  });
});
