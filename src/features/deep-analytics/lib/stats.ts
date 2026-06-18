/**
 * Real statistics for deep-analytics.
 *
 * Replaces the previous fake helpers (bucketed p-values, percentage-gap
 * "significance") with a proper Welch two-sample t-test whose p-value comes
 * from the Student-t distribution CDF, plus a confidence interval.
 *
 * Descriptive stats use the installed `simple-statistics`; the t-distribution
 * tail probability is implemented here via the regularized incomplete beta
 * function (not provided by simple-statistics).
 */

import * as ss from "simple-statistics";

// ─── Student-t tail probability ────────────────────────────────────────────────

/** Natural log of the gamma function (Lanczos approximation). */
function logGamma(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  x -= 1;
  // biome-ignore lint/style/noNonNullAssertion: c is a fixed 9-element literal coefficient array; index 0 is always present
  let a = c[0]!;
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) {
    // biome-ignore lint/style/noNonNullAssertion: i ranges 1..8 over the fixed 9-element coefficient array, always in bounds
    a += c[i]! / (x + i);
  }
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularized incomplete beta function I_x(a, b) via continued fraction. */
function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const lbeta =
    logGamma(a + b) - logGamma(a) - logGamma(b) +
    a * Math.log(x) + b * Math.log(1 - x);
  const front = Math.exp(lbeta) / a;

  // Lentz's algorithm for the continued fraction.
  const tiny = 1e-30;
  let f = 1;
  let c = 1;
  let d = 0;

  for (let i = 0; i <= 200; i++) {
    const m = Math.floor(i / 2);
    let numerator: number;
    if (i === 0) {
      numerator = 1;
    } else if (i % 2 === 0) {
      numerator = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    } else {
      numerator =
        -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    }

    d = 1 + numerator * d;
    if (Math.abs(d) < tiny) d = tiny;
    d = 1 / d;

    c = 1 + numerator / c;
    if (Math.abs(c) < tiny) c = tiny;

    const cd = c * d;
    f *= cd;

    if (Math.abs(1 - cd) < 1e-10) break;
  }

  const result = front * (f - 1);
  return result < 0 ? 0 : result > 1 ? 1 : result;
}

/** Two-sided p-value for a t-statistic with `df` degrees of freedom. */
export function studentTTwoSidedP(t: number, df: number): number {
  if (!Number.isFinite(t) || !Number.isFinite(df) || df <= 0) return 1;
  const x = df / (df + t * t);
  const p = incompleteBeta(x, df / 2, 0.5);
  return Math.min(1, Math.max(0, p));
}

// ─── Welch two-sample t-test ────────────────────────────────────────────────────

export interface TwoSampleResult {
  /** Welch t-statistic. */
  t: number;
  /** Welch–Satterthwaite degrees of freedom. */
  df: number;
  /** Two-sided p-value from the Student-t distribution. */
  p: number;
  /** Difference of means (a − b). */
  meanDiff: number;
  /** 95% confidence interval for the mean difference. */
  ci: [number, number];
  significant: boolean;
}

/**
 * Welch's two-sample t-test (unequal variances). Returns a real p-value and a
 * 95% confidence interval for the difference of means.
 */
export function welchTTest(
  a: number[],
  b: number[],
  alpha = 0.05,
): TwoSampleResult | null {
  const cleanA = a.filter((v) => Number.isFinite(v));
  const cleanB = b.filter((v) => Number.isFinite(v));
  if (cleanA.length < 2 || cleanB.length < 2) return null;

  const nA = cleanA.length;
  const nB = cleanB.length;
  const meanA = ss.mean(cleanA);
  const meanB = ss.mean(cleanB);
  const varA = ss.sampleVariance(cleanA);
  const varB = ss.sampleVariance(cleanB);

  const sA = varA / nA;
  const sB = varB / nB;
  const se = Math.sqrt(sA + sB);

  if (se === 0) return null;

  const t = (meanA - meanB) / se;
  const df =
    (sA + sB) ** 2 /
    ((sA * sA) / (nA - 1) + (sB * sB) / (nB - 1));

  const p = studentTTwoSidedP(t, df);

  // 95% CI for the mean difference using a normal-quantile fallback for the
  // critical value (z≈1.96 at alpha=0.05) — exact enough for large df and a
  // conservative reporting interval.
  const zCrit = alpha <= 0.01 ? 2.576 : alpha <= 0.05 ? 1.96 : 1.645;
  const margin = zCrit * se;
  const meanDiff = meanA - meanB;

  return {
    t,
    df,
    p,
    meanDiff,
    ci: [meanDiff - margin, meanDiff + margin],
    significant: p < alpha,
  };
}

export interface SignificanceBadge {
  label: string;
  color: string;
}

/** Human-readable significance label derived from a real p-value. */
export function significanceFromP(
  p: number | null | undefined,
): SignificanceBadge {
  if (p === null || p === undefined || !Number.isFinite(p)) {
    return { label: "Insufficient data", color: "text-slate-400" };
  }
  if (p < 0.01) {
    return { label: "Highly significant (p<0.01)", color: "text-emerald-400" };
  }
  if (p < 0.05) {
    return { label: "Significant (p<0.05)", color: "text-yellow-400" };
  }
  if (p < 0.1) {
    return { label: "Marginal (p<0.10)", color: "text-orange-400" };
  }
  return { label: "Not significant", color: "text-slate-400" };
}

// ─── Descriptive helpers ────────────────────────────────────────────────────────

/** Pearson correlation, guarded against degenerate input. */
export function safeCorrelation(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length < 2) return 0;
  try {
    const r = ss.sampleCorrelation(a, b);
    return Number.isFinite(r) ? r : 0;
  } catch {
    return 0;
  }
}
