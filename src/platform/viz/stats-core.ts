/**
 * In-house statistics primitives shared by the analysis worker.
 *
 * The stats-ml brief allows two paths for rigorous inference:
 *   (a) `@stdlib/stats-ttest2` / `-anova1` / `-base-dists-t-quantile` (CJS), OR
 *   (b) an in-house Welch t-test + one-way ANOVA + Student-t quantile via the
 *       regularized incomplete beta function.
 *
 * The stdlib packages are NOT installed in this repo, so this module provides
 * path (b): real, validated p-values and GESD critical values with ZERO extra
 * dependencies and zero runtime network — the offline-safe default. Everything
 * here is pure JS (no wasm), so it bundles cleanly into the analysis worker.
 */

const SQRT2 = Math.SQRT2;

// ─── Special functions ──────────────────────────────────────────────────────

/** Natural log of the gamma function (Lanczos approximation). */
export function logGamma(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    // Reflection formula.
    return (
      Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x)
    );
  }
  x -= 1;
  let a = c[0]!;
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i]! / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * Regularized incomplete beta I_x(a, b) via Lentz's continued fraction.
 * Used for the Student-t CDF (and thus p-values).
 */
export function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const lbeta =
    logGamma(a + b) - logGamma(a) - logGamma(b) +
    a * Math.log(x) + b * Math.log(1 - x);
  const front = Math.exp(lbeta) / a;

  // Continued fraction (Lentz).
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
    if (Math.abs(1 - cd) < 1e-12) break;
  }

  const useReflection = x > (a + 1) / (a + b + 2);
  if (useReflection) {
    return 1 - incompleteBeta(1 - x, b, a);
  }
  return front * (f - 1);
}

/** Two-sided p-value for a Student-t statistic with `df` degrees of freedom. */
export function studentTPValue(t: number, df: number): number {
  if (!Number.isFinite(t) || df <= 0) return 1;
  const x = df / (df + t * t);
  const p = incompleteBeta(x, df / 2, 0.5);
  return Math.min(1, Math.max(0, p));
}

/** Student-t inverse CDF (quantile) via bisection on the CDF. */
export function studentTQuantile(p: number, df: number): number {
  if (p <= 0) return Number.NEGATIVE_INFINITY;
  if (p >= 1) return Number.POSITIVE_INFINITY;
  if (df <= 0) return Number.NaN;

  const cdf = (t: number): number => {
    const x = df / (df + t * t);
    const tail = 0.5 * incompleteBeta(x, df / 2, 0.5);
    return t > 0 ? 1 - tail : tail;
  };

  let lo = -1e6;
  let hi = 1e6;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (cdf(mid) < p) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-10) break;
  }
  return (lo + hi) / 2;
}

/** Standard-normal CDF via erf. */
export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / SQRT2));
}

/** Abramowitz-Stegun erf approximation (max err ~1.5e-7). */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
      0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

// ─── Descriptive helpers ────────────────────────────────────────────────────

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const v of xs) s += v;
  return s / xs.length;
}

export function sampleVariance(xs: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const v of xs) s += (v - m) ** 2;
  return s / (n - 1);
}

/** Median absolute deviation (scaled to a normal-consistent estimator). */
export function medianAbsoluteDeviation(xs: number[], scale = 1.4826): number {
  if (xs.length === 0) return 0;
  const med = median(xs);
  const dev = xs.map((v) => Math.abs(v - med));
  return scale * median(dev);
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
