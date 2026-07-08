/**
 * Targeted branch-coverage tests for src/features/ai-analysis/model/stats.ts
 *
 * The existing suite at tests/features/ai-analysis/stats.test.ts already
 * covers all lines and most branches (100% lines / 85.1% branches).
 * This file drives the remaining branches to 100% by:
 *   1. Mocking simple-statistics to force the NaN/Infinity fallback guards.
 *   2. Exercising the `iqr || 1` denominator path in detectIQRAnomalies.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── We mock simple-statistics BEFORE importing the target module so the module
//    receives the mocked version via the shared module registry.
//    vi.mock is hoisted by Vitest, so the factory runs before any imports.
vi.mock("simple-statistics", async (importOriginal) => {
  // Bring in the real implementation so we can selectively override.
  const real = await importOriginal<typeof import("simple-statistics")>();
  return {
    ...real,
    // Controlled overrides injected per-test via vi.mocked().mockImplementation.
    sampleCorrelation: vi.fn(real.sampleCorrelation),
    linearRegression: vi.fn(real.linearRegression),
    linearRegressionLine: vi.fn(real.linearRegressionLine),
    rSquared: vi.fn(real.rSquared),
  };
});

import * as ss from "simple-statistics";
import {
  mean,
  stdDev,
  pearsonCorrelation,
  linearRegression,
  detectZScoreAnomalies,
  detectIQRAnomalies,
  correlationStrength,
  buildHistogram,
} from "@/features/ai-analysis/model/stats";

// ── helpers ──────────────────────────────────────────────────────────────────

const mockedSS = vi.mocked(ss, true);

beforeEach(() => {
  // Reset to real implementations before every test.
  const real = vi.importActual<typeof import("simple-statistics")>("simple-statistics");
  mockedSS.sampleCorrelation.mockRestore?.();
  mockedSS.linearRegression.mockRestore?.();
  mockedSS.linearRegressionLine.mockRestore?.();
  mockedSS.rSquared.mockRestore?.();
});

// ── mean ─────────────────────────────────────────────────────────────────────

describe("mean", () => {
  it("returns 0 for an empty array", () => {
    expect(mean([])).toBe(0);
  });

  it("computes the arithmetic mean of a non-empty array", () => {
    expect(mean([2, 4, 6])).toBe(4);
  });
});

// ── stdDev ───────────────────────────────────────────────────────────────────

describe("stdDev", () => {
  it("returns 0 when fewer than two values are supplied", () => {
    expect(stdDev([])).toBe(0);
    expect(stdDev([7])).toBe(0);
  });

  it("delegates to sample standard deviation for ≥2 values", () => {
    // sample SD of [2, 4] = sqrt(2) ≈ 1.414
    expect(stdDev([2, 4])).toBeCloseTo(Math.sqrt(2), 5);
  });
});

// ── pearsonCorrelation ───────────────────────────────────────────────────────

describe("pearsonCorrelation", () => {
  it("returns 0 when arrays are shorter than 3", () => {
    expect(pearsonCorrelation([], [])).toBe(0);
    expect(pearsonCorrelation([1], [1])).toBe(0);
    expect(pearsonCorrelation([1, 2], [1, 2])).toBe(0);
  });

  it("returns 0 when array lengths differ", () => {
    expect(pearsonCorrelation([1, 2, 3], [1, 2])).toBe(0);
  });

  it("returns 0 when xs has zero variance (constant)", () => {
    expect(pearsonCorrelation([5, 5, 5], [1, 2, 3])).toBe(0);
  });

  it("returns 0 when ys has zero variance (constant)", () => {
    expect(pearsonCorrelation([1, 2, 3], [5, 5, 5])).toBe(0);
  });

  it("returns a finite correlation for a well-conditioned pair", () => {
    const r = pearsonCorrelation([1, 2, 3, 4], [2, 4, 6, 8]);
    expect(r).toBeCloseTo(1);
  });

  it("returns 0 (not NaN) when sampleCorrelation returns NaN — branch: !isFinite", () => {
    // Force sampleCorrelation to return NaN to cover the `!Number.isFinite(r)` branch.
    mockedSS.sampleCorrelation.mockReturnValueOnce(NaN);
    // Use non-constant, length-matched arrays with length ≥ 3 so the variance
    // checks pass and we reach sampleCorrelation.
    const r = pearsonCorrelation([1, 2, 3], [2, 4, 6]);
    expect(r).toBe(0);
  });

  it("returns 0 (not Infinity) when sampleCorrelation returns Infinity — branch: !isFinite", () => {
    mockedSS.sampleCorrelation.mockReturnValueOnce(Infinity);
    const r = pearsonCorrelation([1, 2, 3], [2, 4, 6]);
    expect(r).toBe(0);
  });
});

// ── linearRegression ─────────────────────────────────────────────────────────

describe("linearRegression", () => {
  it("returns flat defaults when xs has fewer than 2 elements", () => {
    expect(linearRegression([], [])).toEqual({ slope: 0, intercept: 0, r2: 0 });
    expect(linearRegression([1], [1])).toEqual({ slope: 0, intercept: 0, r2: 0 });
  });

  it("returns flat line through mean(y) when xs is degenerate (zero variance)", () => {
    const { slope, intercept, r2 } = linearRegression([3, 3, 3], [10, 20, 30]);
    expect(slope).toBe(0);
    expect(intercept).toBeCloseTo(20);
    expect(r2).toBe(0);
  });

  it("recovers y = 3x + 2 from synthetic data", () => {
    const xs = [0, 1, 2, 3, 4];
    const ys = xs.map((x) => 3 * x + 2);
    const { slope, intercept, r2 } = linearRegression(xs, ys);
    expect(slope).toBeCloseTo(3);
    expect(intercept).toBeCloseTo(2);
    expect(r2).toBeCloseTo(1);
  });

  it("returns r2 = 0 (not NaN) when y is constant even though x varies", () => {
    const { slope, r2 } = linearRegression([0, 1, 2, 3], [5, 5, 5, 5]);
    expect(r2).toBe(0);
    expect(Number.isFinite(slope)).toBe(true);
  });

  it("returns slope = 0 when ss.linearRegression yields non-finite slope — branch: !isFinite(reg.m)", () => {
    // Override linearRegression to return NaN slope so the isFinite(reg.m) false-branch is hit.
    mockedSS.linearRegression.mockReturnValueOnce({ m: NaN, b: 5 });
    // rSquared would also be called; let it return a valid value.
    mockedSS.rSquared.mockReturnValueOnce(0.5);
    const { slope } = linearRegression([0, 1, 2], [1, 3, 5]);
    expect(slope).toBe(0);
  });

  it("returns intercept = mean(ys) when ss.linearRegression yields non-finite intercept — branch: !isFinite(reg.b)", () => {
    // Override to return finite slope but NaN intercept.
    mockedSS.linearRegression.mockReturnValueOnce({ m: 2, b: NaN });
    mockedSS.rSquared.mockReturnValueOnce(0.9);
    const ys = [1, 3, 5];
    const { intercept } = linearRegression([0, 1, 2], ys);
    // intercept should fall back to mean(ys) = 3
    expect(intercept).toBeCloseTo(mean(ys));
  });

  it("returns slope = 0 and intercept = mean(ys) when ss.linearRegression yields all non-finite", () => {
    mockedSS.linearRegression.mockReturnValueOnce({ m: Infinity, b: -Infinity });
    mockedSS.rSquared.mockReturnValueOnce(0);
    const ys = [2, 4, 6];
    const { slope, intercept } = linearRegression([0, 1, 2], ys);
    expect(slope).toBe(0);
    expect(intercept).toBeCloseTo(mean(ys));
  });

  it("clamps r2 to [0, 1] when rSquared returns a value below 0", () => {
    // Negative rSquared (can happen with extrapolation but guarded anyway).
    mockedSS.rSquared.mockReturnValueOnce(-0.5);
    const { r2 } = linearRegression([0, 1, 2], [1, 3, 5]);
    expect(r2).toBe(0);
  });

  it("returns r2 = 0 (not NaN) when rSquared returns NaN — branch: !isFinite(rawR2)", () => {
    mockedSS.rSquared.mockReturnValueOnce(NaN);
    const { r2 } = linearRegression([0, 1, 2], [1, 3, 5]);
    expect(r2).toBe(0);
  });
});

// ── detectZScoreAnomalies ─────────────────────────────────────────────────────

describe("detectZScoreAnomalies", () => {
  it("returns empty array when standard deviation is 0 (constant series)", () => {
    expect(detectZScoreAnomalies([4, 4, 4, 4])).toEqual([]);
  });

  it("uses default threshold of 3 and flags obvious outliers", () => {
    // With many clustered values plus one extreme point the outlier's z-score
    // exceeds the default threshold of 3. (A 7-element array rarely achieves
    // z > 3 because the outlier inflates the mean and std too much.)
    const base = new Array<number>(30).fill(10);
    const values = [...base, 100];
    const anomalies = detectZScoreAnomalies(values);
    expect(anomalies.some((a) => a.idx === 30)).toBe(true);
  });

  it("respects a custom threshold", () => {
    const values = [10, 11, 9, 10, 12, 11, 30];
    const anomalies = detectZScoreAnomalies(values, 1);
    expect(anomalies.length).toBeGreaterThan(0);
  });

  it("returns nothing when no value exceeds the threshold", () => {
    const values = [1, 2, 3, 4, 5];
    const anomalies = detectZScoreAnomalies(values, 10);
    expect(anomalies).toEqual([]);
  });
});

// ── detectIQRAnomalies ────────────────────────────────────────────────────────

describe("detectIQRAnomalies", () => {
  it("flags high-side outliers outside IQR fences", () => {
    const values = [10, 11, 12, 13, 14, 15, 200];
    const anomalies = detectIQRAnomalies(values);
    expect(anomalies.some((a) => a.idx === 6)).toBe(true);
  });

  it("flags low-side outliers outside IQR fences", () => {
    const values = [-200, 10, 11, 12, 13, 14, 15];
    const anomalies = detectIQRAnomalies(values);
    expect(anomalies.some((a) => a.idx === 0)).toBe(true);
  });

  it("returns empty when no value is outside the fences", () => {
    const values = [1, 2, 3, 4, 5];
    expect(detectIQRAnomalies(values)).toEqual([]);
  });

  it("uses (iqr || 1) denominator when IQR is 0 and a value exceeds the fence — branch: iqr === 0 path", () => {
    // When IQR = 0 the fences collapse to [q1, q3] = [c, c].
    // A value different from c is outside the fence.
    // Example: [1, 1, 1, 1, 2] → q1=1, q3=1, iqr=0, hi=1, the value 2 > hi.
    // Score = (2 - 1) / (0 || 1) = 1.
    const values = [1, 1, 1, 1, 2];
    const anomalies = detectIQRAnomalies(values);
    // The outlier must be found and its score should use the || 1 fallback.
    expect(anomalies.some((a) => a.idx === 4)).toBe(true);
    const outlier = anomalies.find((a) => a.idx === 4)!;
    // score = (2 - hi) / 1 = (2 - 1) / 1 = 1
    expect(outlier.score).toBeCloseTo(1);
  });

  it("uses (iqr || 1) denominator for low-side outlier when IQR is 0", () => {
    // [-1, 1, 1, 1, 1] → q1=1, q3=1, iqr=0, lo=1.
    // value -1 < lo=1, score = (1 - (-1)) / (0 || 1) = 2.
    const values = [-1, 1, 1, 1, 1];
    const anomalies = detectIQRAnomalies(values);
    expect(anomalies.some((a) => a.idx === 0)).toBe(true);
    const outlier = anomalies.find((a) => a.idx === 0)!;
    expect(outlier.score).toBeCloseTo(2);
  });
});

// ── correlationStrength ──────────────────────────────────────────────────────

describe("correlationStrength", () => {
  it('returns "very_strong" for |r| >= 0.8', () => {
    expect(correlationStrength(0.8)).toBe("very_strong");
    expect(correlationStrength(-1.0)).toBe("very_strong");
    expect(correlationStrength(0.99)).toBe("very_strong");
  });

  it('returns "strong" for 0.6 <= |r| < 0.8', () => {
    expect(correlationStrength(0.6)).toBe("strong");
    expect(correlationStrength(-0.75)).toBe("strong");
  });

  it('returns "moderate" for 0.4 <= |r| < 0.6', () => {
    expect(correlationStrength(0.4)).toBe("moderate");
    expect(correlationStrength(-0.5)).toBe("moderate");
  });

  it('returns "weak" for 0.2 <= |r| < 0.4', () => {
    expect(correlationStrength(0.2)).toBe("weak");
    expect(correlationStrength(-0.3)).toBe("weak");
  });

  it('returns "none" for |r| < 0.2', () => {
    expect(correlationStrength(0)).toBe("none");
    expect(correlationStrength(0.1)).toBe("none");
    expect(correlationStrength(-0.19)).toBe("none");
  });
});

// ── buildHistogram ────────────────────────────────────────────────────────────

describe("buildHistogram", () => {
  it("returns zero-filled bins for an empty values array", () => {
    expect(buildHistogram([], 4)).toEqual([0, 0, 0, 0]);
  });

  it("returns zero-filled bins when all values are identical (min === max)", () => {
    expect(buildHistogram([7, 7, 7], 5)).toEqual([0, 0, 0, 0, 0]);
  });

  it("distributes values across the correct bins and preserves total count", () => {
    const values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const hist = buildHistogram(values, 5);
    expect(hist).toHaveLength(5);
    expect(hist.reduce((a, b) => a + b, 0)).toBe(10);
  });

  it("places the maximum value into the last bin (clamp to bins - 1)", () => {
    // With values [0, 10] and 2 bins, 0 → bin 0, 10 → bin 1 (clamped).
    const hist = buildHistogram([0, 10], 2);
    expect(hist[0]).toBe(1);
    expect(hist[1]).toBe(1);
  });

  it("handles a single bin correctly", () => {
    const hist = buildHistogram([1, 5, 9], 1);
    expect(hist).toHaveLength(1);
    expect(hist[0]).toBe(3);
  });

  it("handles two values with different magnitude", () => {
    // Ensures the Math.min(floor(…), bins - 1) clamp fires for the max value.
    const hist = buildHistogram([0, 100], 10);
    expect(hist.reduce((a, b) => a + b, 0)).toBe(2);
    // max value (100) must be clamped to bin 9, not 10.
    expect(hist[9]).toBe(1);
  });
});
