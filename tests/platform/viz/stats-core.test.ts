import { describe, expect, it } from "vitest";

import {
  erf,
  incompleteBeta,
  logGamma,
  mean,
  median,
  medianAbsoluteDeviation,
  normalCdf,
  sampleVariance,
  studentTPValue,
  studentTQuantile,
} from "@/platform/viz/stats-core";

/**
 * Behavioral tests for the in-house statistics primitives.
 *
 * Reference values are taken from standard statistical tables / known closed
 * forms:
 *   - logGamma(n) == ln((n-1)!)            (factorial identity)
 *   - logGamma(1/2) == 0.5 * ln(pi)         (gamma(1/2) = sqrt(pi))
 *   - I_x(1,1) == x                         (incomplete beta of a uniform)
 *   - t_{0.975, 10} ~= 2.228                (Student-t critical value)
 *   - Phi(1.96) ~= 0.975, Phi(0) == 0.5     (standard normal CDF)
 *   - erf(1) ~= 0.8427                       (error function)
 */

describe("logGamma", () => {
  it("returns ~0 for gamma(1) (== ln(0!) == 0)", () => {
    expect(logGamma(1)).toBeCloseTo(0, 10);
  });

  it("returns exactly 0 for gamma(2) (== ln(1!) == 0)", () => {
    expect(logGamma(2)).toBeCloseTo(0, 12);
  });

  it("matches the factorial identity ln((n-1)!) for an integer", () => {
    // gamma(6) == 5! == 120
    expect(logGamma(6)).toBeCloseTo(Math.log(120), 10);
  });

  it("matches gamma(1/2) == sqrt(pi) via the half-integer value", () => {
    // logGamma(0.5) == ln(sqrt(pi)) == 0.5 * ln(pi)
    expect(logGamma(0.5)).toBeCloseTo(0.5 * Math.log(Math.PI), 10);
  });

  it("uses the reflection formula for x < 0.5 and stays finite", () => {
    // gamma(1/4) == 3.625609908...; logGamma is ln of that == 1.28802...
    const value = logGamma(0.25);
    expect(value).toBeCloseTo(Math.log(3.625609908221908), 8);
    expect(Number.isFinite(value)).toBe(true);
  });

  it("matches the reflection identity logGamma(x)+logGamma(1-x) == ln(pi/sin(pi x))", () => {
    const x = 0.3;
    const lhs = logGamma(x) + logGamma(1 - x);
    const rhs = Math.log(Math.PI / Math.sin(Math.PI * x));
    expect(lhs).toBeCloseTo(rhs, 9);
  });
});

describe("incompleteBeta", () => {
  it("clamps to 0 for x <= 0 (boundary and below)", () => {
    expect(incompleteBeta(0, 2, 3)).toBe(0);
    expect(incompleteBeta(-0.5, 2, 3)).toBe(0);
  });

  it("clamps to 1 for x >= 1 (boundary and above)", () => {
    expect(incompleteBeta(1, 2, 3)).toBe(1);
    expect(incompleteBeta(1.5, 2, 3)).toBe(1);
  });

  it("equals x for the uniform case I_x(1,1) == x (no reflection branch)", () => {
    // (a+1)/(a+b+2) = 2/4 = 0.5, so x=0.3 stays on the direct branch.
    expect(incompleteBeta(0.3, 1, 1)).toBeCloseTo(0.3, 10);
  });

  it("uses the reflection branch for large x and stays consistent with x", () => {
    // x=0.8 > 0.5 triggers the useReflection path for I_x(1,1).
    expect(incompleteBeta(0.8, 1, 1)).toBeCloseTo(0.8, 10);
  });

  it("matches a known table value I_0.3(2,3) ~= 0.3483", () => {
    expect(incompleteBeta(0.3, 2, 3)).toBeCloseTo(0.3483, 4);
  });

  it("is symmetric: I_x(a,b) == 1 - I_(1-x)(b,a)", () => {
    const a = 2.5;
    const b = 4.5;
    const x = 0.4;
    const left = incompleteBeta(x, a, b);
    const right = 1 - incompleteBeta(1 - x, b, a);
    expect(left).toBeCloseTo(right, 10);
  });

  it("returns the regularized value in [0,1] for a mid-range input", () => {
    const value = incompleteBeta(0.5, 3, 7);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(1);
  });
});

describe("studentTPValue", () => {
  it("returns 1 for a zero t-statistic (perfectly central)", () => {
    expect(studentTPValue(0, 10)).toBeCloseTo(1, 10);
  });

  it("matches the two-sided p-value for the 95% critical t (~0.05)", () => {
    // t_{0.975,10} ~= 2.228 -> two-sided p ~= 0.05
    expect(studentTPValue(2.228, 10)).toBeCloseTo(0.05, 3);
  });

  it("is symmetric in the sign of t", () => {
    expect(studentTPValue(-2.228, 10)).toBeCloseTo(studentTPValue(2.228, 10), 12);
  });

  it("shrinks toward 0 as |t| grows", () => {
    const small = studentTPValue(1, 10);
    const large = studentTPValue(4, 10);
    expect(large).toBeLessThan(small);
    expect(large).toBeGreaterThan(0);
  });

  it("returns 1 for a non-finite t (NaN guard)", () => {
    expect(studentTPValue(Number.NaN, 10)).toBe(1);
  });

  it("returns 1 for an infinite t because of the finite-only guard", () => {
    // NOTE: statistically an infinite t implies p -> 0, but the guard returns 1.
    // This documents the CURRENT behavior (see bugsFound).
    expect(studentTPValue(Number.POSITIVE_INFINITY, 10)).toBe(1);
    expect(studentTPValue(Number.NEGATIVE_INFINITY, 10)).toBe(1);
  });

  it("returns 1 for non-positive degrees of freedom", () => {
    expect(studentTPValue(5, 0)).toBe(1);
    expect(studentTPValue(5, -3)).toBe(1);
  });

  it("never returns a value outside [0,1]", () => {
    for (const t of [0.1, 1, 2.5, 10, 50]) {
      for (const df of [1, 2, 5, 30, 100]) {
        const p = studentTPValue(t, df);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("studentTQuantile", () => {
  it("returns -Infinity for p <= 0 (boundary and below)", () => {
    expect(studentTQuantile(0, 10)).toBe(Number.NEGATIVE_INFINITY);
    expect(studentTQuantile(-0.5, 10)).toBe(Number.NEGATIVE_INFINITY);
  });

  it("returns +Infinity for p >= 1 (boundary and above)", () => {
    expect(studentTQuantile(1, 10)).toBe(Number.POSITIVE_INFINITY);
    expect(studentTQuantile(1.5, 10)).toBe(Number.POSITIVE_INFINITY);
  });

  it("returns NaN for non-positive degrees of freedom", () => {
    expect(studentTQuantile(0.5, 0)).toBeNaN();
    expect(studentTQuantile(0.5, -1)).toBeNaN();
  });

  it("returns ~0 at the median (p = 0.5)", () => {
    expect(studentTQuantile(0.5, 10)).toBeCloseTo(0, 6);
  });

  it("matches the 97.5% critical value t_{0.975,10} ~= 2.228", () => {
    expect(studentTQuantile(0.975, 10)).toBeCloseTo(2.228, 3);
  });

  it("matches the 97.5% critical value for large df approaching the normal 1.96", () => {
    // With df -> inf, t_{0.975} -> z_{0.975} ~= 1.95996
    expect(studentTQuantile(0.975, 100000)).toBeCloseTo(1.96, 2);
  });

  it("is antisymmetric: q(p) == -q(1-p)", () => {
    const upper = studentTQuantile(0.9, 8);
    const lower = studentTQuantile(0.1, 8);
    expect(lower).toBeCloseTo(-upper, 5);
  });

  it("round-trips against studentTPValue for a critical value", () => {
    // q at 0.975 has two-sided p-value ~0.05.
    const t = studentTQuantile(0.975, 20);
    expect(studentTPValue(t, 20)).toBeCloseTo(0.05, 3);
  });

  it("is monotonically increasing in p", () => {
    const a = studentTQuantile(0.6, 12);
    const b = studentTQuantile(0.8, 12);
    const c = studentTQuantile(0.95, 12);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
});

describe("normalCdf", () => {
  it("returns ~0.5 at z = 0", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
  });

  it("matches Phi(1.96) ~= 0.975", () => {
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 4);
  });

  it("matches Phi(-1.96) ~= 0.025", () => {
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 4);
  });

  it("is symmetric: Phi(z) + Phi(-z) == 1", () => {
    expect(normalCdf(1.3) + normalCdf(-1.3)).toBeCloseTo(1, 6);
  });

  it("approaches 1 in the far-right tail and 0 in the far-left tail", () => {
    expect(normalCdf(6)).toBeGreaterThan(0.999999);
    expect(normalCdf(-6)).toBeLessThan(0.000001);
  });

  it("is monotonically increasing", () => {
    expect(normalCdf(-1)).toBeLessThan(normalCdf(0));
    expect(normalCdf(0)).toBeLessThan(normalCdf(1));
  });
});

describe("erf", () => {
  it("returns ~0 at x = 0", () => {
    expect(erf(0)).toBeCloseTo(0, 6);
  });

  it("matches erf(1) ~= 0.8427", () => {
    expect(erf(1)).toBeCloseTo(0.8427, 4);
  });

  it("is an odd function: erf(-x) == -erf(x)", () => {
    expect(erf(-1)).toBeCloseTo(-erf(1), 12);
    expect(erf(-0.5)).toBeCloseTo(-erf(0.5), 12);
  });

  it("saturates toward +/-1 in the tails", () => {
    expect(erf(3)).toBeGreaterThan(0.9999);
    expect(erf(-3)).toBeLessThan(-0.9999);
  });

  it("stays within (-1, 1) for finite inputs", () => {
    for (const x of [-2, -0.7, 0.2, 1.5, 2.5]) {
      const value = erf(x);
      expect(value).toBeGreaterThan(-1);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("mean", () => {
  it("returns 0 for an empty array (degenerate guard)", () => {
    expect(mean([])).toBe(0);
  });

  it("averages a simple sequence", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });

  it("handles negatives that cancel to zero", () => {
    expect(mean([-5, 5])).toBe(0);
  });

  it("returns the single value for a one-element array", () => {
    expect(mean([42])).toBe(42);
  });

  it("propagates NaN when an element is NaN", () => {
    expect(mean([Number.NaN, 1, 2])).toBeNaN();
  });
});

describe("sampleVariance", () => {
  it("returns 0 for an empty array", () => {
    expect(sampleVariance([])).toBe(0);
  });

  it("returns 0 for a single element (n < 2 guard)", () => {
    expect(sampleVariance([5])).toBe(0);
  });

  it("returns 0 for identical values (no spread)", () => {
    expect(sampleVariance([3, 3, 3])).toBe(0);
  });

  it("uses the n-1 (Bessel-corrected) denominator", () => {
    // Known textbook example: variance == 32/7 == 4.5714...
    expect(sampleVariance([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(4.571428571, 6);
  });

  it("computes a simple two-point variance with n-1", () => {
    // values [2,4]: mean 3, deviations 1 and 1, sum 2, /(2-1) = 2
    expect(sampleVariance([2, 4])).toBeCloseTo(2, 12);
  });
});

describe("median", () => {
  it("returns 0 for an empty array (degenerate guard)", () => {
    expect(median([])).toBe(0);
  });

  it("returns the middle element for odd length (unsorted input)", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("averages the two middle elements for even length", () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("returns the single value for a one-element array", () => {
    expect(median([7])).toBe(7);
  });

  it("does not mutate the caller's array (sorts a copy)", () => {
    const input = [3, 1, 2];
    median(input);
    expect(input).toEqual([3, 1, 2]);
  });

  it("sorts numerically, not lexicographically", () => {
    // Lexicographic sort would order [10, 2, 30] as [10, 2, 30] -> median 2.
    expect(median([10, 2, 30])).toBe(10);
  });
});

describe("medianAbsoluteDeviation", () => {
  it("returns 0 for an empty array (degenerate guard)", () => {
    expect(medianAbsoluteDeviation([])).toBe(0);
  });

  it("returns 0 for identical values (no deviation)", () => {
    expect(medianAbsoluteDeviation([1, 1, 1])).toBe(0);
  });

  it("scales the raw MAD by the default normal-consistency factor 1.4826", () => {
    // [1..5]: median 3, abs deviations [2,1,0,1,2], median of those == 1.
    expect(medianAbsoluteDeviation([1, 2, 3, 4, 5])).toBeCloseTo(1.4826, 10);
  });

  it("honors a custom scale of 1 (raw MAD)", () => {
    expect(medianAbsoluteDeviation([1, 2, 3, 4, 5], 1)).toBeCloseTo(1, 10);
  });

  it("is robust to a single extreme outlier", () => {
    // The outlier 1000 barely shifts the median deviation.
    const withOutlier = medianAbsoluteDeviation([1, 2, 3, 4, 1000], 1);
    expect(withOutlier).toBeCloseTo(1, 10);
  });
});
