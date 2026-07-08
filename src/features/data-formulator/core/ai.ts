/**
 * Data Formulator — chart math helpers.
 *
 * Historically this file also held a ~700-line rule-based NL→chart/derive engine
 * (regex patterns, fuzzy column matching, best-effort fallbacks). That is gone:
 * all natural-language → chart / SQL work now runs through the AI-only swarm
 * agents (`core/swarm/agents/*`). What remains here are two pure, deterministic
 * statistics used by the chart renderer for trendlines and outlier marking.
 */

// ─── Outlier detection (IQR) ──────────────────────────────────────────────────

export function flagOutliers(values: number[]): boolean[] {
  if (values.length < 4) return values.map(() => false);
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  return values.map((v) => v < lo || v > hi);
}

// ─── Linear trendline (least squares) ─────────────────────────────────────────

export function linearTrendline(values: number[]): number[] {
  const n = values.length;
  if (n < 2) return values.slice();
  const xs = Array.from({ length: n }, (_, i) => i);
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (values[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  return xs.map((x) => slope * x + intercept);
}
