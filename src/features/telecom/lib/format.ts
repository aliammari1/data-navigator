// ─── Number / duration formatters ────────────────────────────────────────────

export function fmtN(n: number, dec = 0): string {
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: dec,
    minimumFractionDigits: dec,
  }).format(n);
}

export function fmtCompact(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

export function fmtAmount(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(n);
}

export function fmtPct(n: number): string {
  // Truncate (floor) to 1 decimal to avoid rounding 99.97% → "100%"
  if (n > 0 && n < 0.1) return "<0.1%";
  const floored = Math.floor(n * 10) / 10;
  const fixed = floored.toFixed(1);
  return fixed.endsWith(".0") ? `${Math.floor(n)}%` : `${fixed}%`;
}

export function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// ─── Numeric helpers ──────────────────────────────────────────────────────────

export function safeNum(v: unknown): number {
  // DuckDB WASM can return typed arrays (e.g. Uint32Array) for aggregates,
  // and BigInt for COUNT(*). Unwrap to a plain scalar before converting.
  let val = v;
  if (ArrayBuffer.isView(val) && !(val instanceof DataView)) {
    val = (val as unknown as ArrayLike<unknown>)[0];
  }
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function movingAverage(arr: number[], window: number): number[] {
  if (window < 1 || arr.length < window) return [];
  const result: number[] = [];
  let sum = arr.slice(0, window).reduce((a, b) => a + b, 0);
  result.push(sum / window);
  for (let i = window; i < arr.length; i++) {
    sum += arr[i] - arr[i - window];
    result.push(sum / window);
  }
  return result;
}
