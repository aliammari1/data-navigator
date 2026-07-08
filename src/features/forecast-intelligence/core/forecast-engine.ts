/**
 * Forecast engine — pure, deterministic, fully offline time-series forecasting.
 *
 * No "use client", no external services, no I/O. Every export is a pure function
 * so the whole module is trivially unit-testable and safe to import anywhere
 * (server, worker, or client).
 *
 * ── The model ────────────────────────────────────────────────────────────────
 * We combine two classic, well-understood techniques:
 *
 *  1. **Additive seasonal decomposition.** Given a season length `m` (e.g. 7 for
 *     daily data with a weekly cycle) we estimate a seasonal index for each of
 *     the `m` phases as the mean *detrended* deviation for that phase, then
 *     normalise the indices to sum to zero (additive seasonality must not shift
 *     the level). The series is deseasonalised by subtracting its phase index.
 *
 *  2. **Holt's linear trend (double-exponential smoothing)** on the
 *     deseasonalised series. We maintain a smoothed `level` and `trend`:
 *
 *        levelₜ = α·yₜ           + (1−α)·(levelₜ₋₁ + trendₜ₋₁)
 *        trendₜ = β·(levelₜ−levelₜ₋₁) + (1−β)·trendₜ₋₁
 *
 *     The h-step-ahead forecast is `levelₙ + h·trendₙ`, to which we add the
 *     seasonal index of the corresponding future phase.
 *
 * When the series is too short for seasonality (or `m` ≤ 1) we degrade
 * gracefully to a pure Holt trend, and for a constant series to a flat forecast.
 *
 * ── Uncertainty ──────────────────────────────────────────────────────────────
 * One-step in-sample residuals give a residual standard deviation σ. The
 * confidence band widens with the forecast horizon as σ·√h (a random-walk-style
 * error-accumulation approximation) scaled by a z multiplier `k`, so the band is
 * monotonically non-decreasing in h.
 *
 * ── Validation ───────────────────────────────────────────────────────────────
 * `backtest` re-fits on a holdout split and reports MAE / RMSE / MAPE, and
 * `detectResidualAnomalies` flags in-sample points whose residual exceeds
 * `k·σ` (robust z on the residual series).
 */

// ─── Public types ─────────────────────────────────────────────────────────────

/** A single observation: ISO-ish date string + numeric value. */
export interface SeriesPoint {
  date: string;
  value: number;
}

/** A forecasted future step with a confidence interval. */
export interface ForecastPoint {
  /** Synthesised future date (see `addDays`), continuing the input cadence. */
  date: string;
  /** Point forecast (level + trend + seasonal index). */
  value: number;
  /** Lower confidence bound = value − k·σ·√h. */
  lower: number;
  /** Upper confidence bound = value + k·σ·√h. */
  upper: number;
}

/** Backtest accuracy metrics over a holdout. */
export interface BacktestMetrics {
  /** Mean absolute error. */
  mae: number;
  /** Root mean squared error. */
  rmse: number;
  /** Mean absolute percentage error, in percent (0–100+). */
  mape: number;
  /** Number of points in the holdout that were scored. */
  sampleSize: number;
}

/** A flagged in-sample anomaly on the model residuals. */
export interface ResidualAnomaly {
  index: number;
  date: string;
  value: number;
  /** Model's fitted (expected) value at this index. */
  expected: number;
  /** Signed residual (value − expected). */
  residual: number;
  /** Robust z-score of the residual. */
  zScore: number;
}

/** Tunable forecast parameters. All have sensible defaults. */
export interface ForecastOptions {
  /** Steps to forecast beyond the last observation. */
  horizon?: number;
  /** Season length (e.g. 7 for weekly). 0/1 disables seasonality. */
  seasonLength?: number;
  /** Level smoothing factor α ∈ (0,1]. */
  alpha?: number;
  /** Trend smoothing factor β ∈ [0,1]. */
  beta?: number;
  /**
   * Confidence multiplier k for the prediction band (≈1.96 for 95%).
   *
   * @deprecated Prefer `ciLevel` (coverage probability) which derives the z
   * multiplier via the normal quantile. `ci` is retained for backward
   * compatibility; when both are absent the multiplier comes from
   * `DEFAULTS.ciLevel`.
   */
  ci?: number;
  /**
   * Coverage probability for the prediction interval, e.g. 0.95 → z ≈ 1.96.
   * Decoupled from anomaly sensitivity so widening the band does not silently
   * change which in-sample points are flagged as anomalies.
   */
  ciLevel?: number;
  /**
   * Robust-z threshold for residual anomaly flagging. Conceptually distinct
   * from interval coverage: a point is anomalous when |robust z| exceeds this.
   * Defaults to ~3.0 (a conventional outlier cutoff).
   */
  anomalyZ?: number;
}

/** Full result of a forecast run. */
export interface ForecastResult {
  /** Echo of the input, normalised. */
  history: SeriesPoint[];
  /** In-sample one-step fitted values aligned to `history` (index-matched). */
  fitted: number[];
  /** Future forecast points with CI bands. */
  forecast: ForecastPoint[];
  /** Estimated additive seasonal indices (length = effective season). */
  seasonalIndices: number[];
  /** Residual standard deviation used to size the CI. */
  residualStd: number;
  /** Final smoothed level and trend after fitting. */
  level: number;
  trend: number;
  /** Backtest metrics on an internal holdout (when the series is long enough). */
  metrics: BacktestMetrics | null;
  /** Residual-based in-sample anomalies. */
  anomalies: ResidualAnomaly[];
  /** True when the model degraded (constant series / too short for season). */
  degraded: boolean;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULTS: Required<ForecastOptions> = {
  horizon: 7,
  seasonLength: 7,
  alpha: 0.4,
  beta: 0.1,
  ci: 1.96,
  ciLevel: 0.95,
  anomalyZ: 3,
};

/**
 * Inverse standard-normal CDF (Acklam's rational approximation, |err| < 1.15e-9).
 * Used to turn a coverage probability (e.g. 0.95) into a z multiplier instead of
 * hardcoding 1.96, so arbitrary `ciLevel`s get a correct interval.
 */
export function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;

  // Coefficients.
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
    -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q: number;
  let r: number;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
    );
  }
  if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
      (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
    );
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return (
    -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
    ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
  );
}

/**
 * Resolve the effective z multiplier for the prediction band. Precedence:
 * explicit `ci` (legacy multiplier) → `ciLevel` via the normal quantile →
 * default 95% level. The two-sided multiplier for coverage c is Φ⁻¹(0.5 + c/2).
 */
function resolveBandZ(opts: ForecastOptions): number {
  if (typeof opts.ci === "number" && Number.isFinite(opts.ci)) return opts.ci;
  const level = typeof opts.ciLevel === "number" ? opts.ciLevel : DEFAULTS.ciLevel;
  const clamped = Math.min(0.999999, Math.max(0.5, level));
  return normalQuantile(0.5 + clamped / 2);
}

/** Resolve the robust-z anomaly threshold (independent of the band width). */
function resolveAnomalyZ(opts: ForecastOptions): number {
  return typeof opts.anomalyZ === "number" && Number.isFinite(opts.anomalyZ)
    ? opts.anomalyZ
    : DEFAULTS.anomalyZ;
}

// ─── Small numeric helpers (kept local; the engine must stay dependency-free) ──

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Population standard deviation with an optional degrees-of-freedom offset. */
function stdDev(xs: number[], ddof = 0): number {
  const n = xs.length;
  if (n - ddof <= 0) return 0;
  const m = mean(xs);
  let acc = 0;
  for (const x of xs) acc += (x - m) ** 2;
  return Math.sqrt(acc / (n - ddof));
}

/** Median, used for robust residual scoring. */
function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** Add `n` days to an ISO date (YYYY-MM-DD…). Falls back to index labels. */
function addDays(isoDate: string, n: number): string {
  const base = new Date(isoDate);
  if (Number.isNaN(base.getTime())) {
    // Non-date label — synthesise a sequential index marker instead.
    return `t+${n}`;
  }
  const next = new Date(base.getTime() + n * 86_400_000);
  return next.toISOString().slice(0, 10);
}

// ─── Input normalisation ──────────────────────────────────────────────────────

/**
 * Clean a raw series: drop points whose value is non-finite (handles "missing
 * points"), coerce values to numbers, and keep chronological input order. We do
 * NOT interpolate — the engine treats the surviving points as equally spaced,
 * which is the right default for daily KPI feeds with the occasional gap.
 */
export function normalizeSeries(series: SeriesPoint[]): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (const p of series) {
    const v = Number(p?.value);
    if (!Number.isFinite(v)) continue;
    out.push({ date: String(p.date), value: v });
  }
  return out;
}

// ─── Seasonal decomposition ───────────────────────────────────────────────────

/**
 * Estimate additive seasonal indices for a series of length n with season m.
 * Strategy: remove a coarse linear trend (so seasonality isn't biased by drift),
 * average the detrended residual per phase, then centre indices to sum to zero.
 *
 * Returns an array of length m. If m ≤ 1 or n < 2·m, returns all-zero indices
 * (i.e. "no usable seasonality"), letting the caller fall back to pure trend.
 */
export function seasonalIndices(values: number[], m: number): number[] {
  const n = values.length;
  if (m <= 1 || n < 2 * m) return new Array(Math.max(1, m)).fill(0);

  // Coarse OLS trend over t = 0..n-1.
  const { slope, intercept } = ols(values);
  const detrended = values.map((y, t) => y - (intercept + slope * t));

  // Average the detrended residual within each seasonal phase.
  const sums = new Array(m).fill(0);
  const counts = new Array(m).fill(0);
  for (let t = 0; t < n; t++) {
    const phase = t % m;
    sums[phase] += detrended[t]!;
    counts[phase]++;
  }
  const raw = sums.map((s, i) => (counts[i] ? s / counts[i] : 0));

  // Centre so the indices sum to zero (additive seasonality is level-neutral).
  const c = mean(raw);
  return raw.map((r) => r - c);
}

/** Ordinary least-squares slope/intercept over equally spaced t = 0..n-1. */
function ols(values: number[]): { slope: number; intercept: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0 };
  const meanT = (n - 1) / 2;
  const meanY = mean(values);
  let num = 0;
  let den = 0;
  for (let t = 0; t < n; t++) {
    const dt = t - meanT;
    num += dt * (values[t]! - meanY);
    den += dt * dt;
  }
  const slope = den === 0 ? 0 : num / den;
  return { slope, intercept: meanY - slope * meanT };
}

// ─── Holt's linear trend (double-exponential smoothing) ───────────────────────

interface HoltState {
  level: number;
  trend: number;
  /** One-step-ahead in-sample fitted values, index-aligned to the input. */
  fitted: number[];
}

/**
 * Run Holt's linear smoothing over `values`, returning the final level/trend and
 * the one-step-ahead fitted series. Initialised with level = y₀ and trend = the
 * average of the first differences (a stable, deterministic seed).
 */
function holt(values: number[], alpha: number, beta: number): HoltState {
  const n = values.length;
  if (n === 0) return { level: 0, trend: 0, fitted: [] };
  if (n === 1) return { level: values[0]!, trend: 0, fitted: [values[0]!] };

  let level = values[0]!;
  // Seed trend from the mean first difference for a deterministic start.
  let trend = (values[n - 1]! - values[0]!) / (n - 1);

  const fitted: number[] = new Array(n);
  fitted[0] = values[0]!; // first point fits itself (no prior to forecast from)

  for (let t = 1; t < n; t++) {
    // Forecast for time t made at t-1 (before seeing yₜ).
    fitted[t] = level + trend;
    const y = values[t]!;
    const prevLevel = level;
    level = alpha * y + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }

  return { level, trend, fitted };
}

// ─── Core forecast ────────────────────────────────────────────────────────────

/**
 * Forecast a numeric time series with additive seasonal decomposition + Holt's
 * linear trend, returning point forecasts, CI bands, fitted values, seasonal
 * indices, residual σ, a backtest, and residual anomalies.
 *
 * Deterministic for a given input + options (no randomness, no Date.now()).
 */
export function forecastSeries(
  rawSeries: SeriesPoint[],
  options: ForecastOptions = {},
): ForecastResult {
  const opts = { ...DEFAULTS, ...options };
  const history = normalizeSeries(rawSeries);
  const values = history.map((p) => p.value);
  const n = values.length;

  // ── Degenerate cases ────────────────────────────────────────────────────────
  if (n === 0) {
    return emptyResult(history);
  }
  if (n === 1) {
    const v = values[0]!;
    return {
      history,
      fitted: [v],
      forecast: buildFlatForecast(history, v, 0, opts),
      seasonalIndices: [0],
      residualStd: 0,
      level: v,
      trend: 0,
      metrics: null,
      anomalies: [],
      degraded: true,
    };
  }

  // Constant series → flat forecast, zero uncertainty, no anomalies.
  const allEqual = values.every((v) => v === values[0]);
  if (allEqual) {
    const v = values[0]!;
    return {
      history,
      fitted: values.slice(),
      forecast: buildFlatForecast(history, v, 0, opts),
      seasonalIndices: [0],
      residualStd: 0,
      level: v,
      trend: 0,
      metrics: backtest(values, opts),
      anomalies: [],
      degraded: true,
    };
  }

  // ── Seasonal decomposition ──────────────────────────────────────────────────
  const m = opts.seasonLength;
  const indices = seasonalIndices(values, m);
  const hasSeason = indices.some((i) => i !== 0);
  const effectiveM = hasSeason ? m : 1;

  // Deseasonalise: subtract each point's phase index.
  const deseasonalised = values.map((y, t) => y - (hasSeason ? indices[t % m]! : 0));

  // ── Holt on the deseasonalised series ───────────────────────────────────────
  const state = holt(deseasonalised, opts.alpha, opts.beta);

  // Reseasonalise the fitted values for honest in-sample residuals.
  const fitted = state.fitted.map((f, t) => f + (hasSeason ? indices[t % m]! : 0));

  // One-step residuals (skip index 0 which fits itself).
  const residuals: number[] = [];
  for (let t = 1; t < n; t++) residuals.push(values[t]! - fitted[t]!);
  const residualStd = stdDev(residuals, 1); // sample σ (ddof=1)

  // ── Future forecast with CI bands ───────────────────────────────────────────
  // Band width uses the coverage-derived z; anomaly flagging uses a separate,
  // independent robust-z threshold so the two concerns no longer share `ci`.
  const bandZ = resolveBandZ(options);
  const anomalyZ = resolveAnomalyZ(options);
  const forecast: ForecastPoint[] = [];
  const lastDate = history[n - 1]!.date;
  for (let h = 1; h <= opts.horizon; h++) {
    const base = state.level + h * state.trend;
    const seasonal = hasSeason ? indices[(n - 1 + h) % m]! : 0;
    const point = base + seasonal;
    // Error grows with √h (accumulating one-step errors).
    const halfWidth = bandZ * residualStd * Math.sqrt(h);
    forecast.push({
      date: addDays(lastDate, h),
      value: point,
      lower: point - halfWidth,
      upper: point + halfWidth,
    });
  }

  return {
    history,
    fitted,
    forecast,
    seasonalIndices: hasSeason ? indices : new Array(effectiveM).fill(0),
    residualStd,
    level: state.level,
    trend: state.trend,
    metrics: backtest(values, opts),
    anomalies: detectResidualAnomalies(history, fitted, anomalyZ),
    degraded: false,
  };
}

// ─── Backtesting ──────────────────────────────────────────────────────────────

/**
 * Hold out the last ~20% of the series (min 1, capped at the horizon), refit on
 * the prefix, forecast forward, and score MAE / RMSE / MAPE against the actual
 * holdout. Returns null when the series is too short to split meaningfully.
 */
export function backtest(values: number[], options: ForecastOptions = {}): BacktestMetrics | null {
  const opts = { ...DEFAULTS, ...options };
  const n = values.length;
  // Need enough history to fit AND a holdout to score.
  if (n < 6) return null;

  const holdout = Math.max(1, Math.min(Math.floor(n * 0.2), opts.horizon));
  const trainLen = n - holdout;
  if (trainLen < 4) return null;

  const train = values.slice(0, trainLen);
  const actual = values.slice(trainLen);

  // Refit on the training prefix (same model, no CI needed here).
  const indices = seasonalIndices(train, opts.seasonLength);
  const hasSeason = indices.some((i) => i !== 0);
  const deseason = train.map((y, t) => y - (hasSeason ? indices[t % opts.seasonLength]! : 0));
  const state = holt(deseason, opts.alpha, opts.beta);

  const predicted = actual.map((_, i) => {
    const h = i + 1;
    const base = state.level + h * state.trend;
    const seasonal = hasSeason ? indices[(trainLen - 1 + h) % opts.seasonLength]! : 0;
    return base + seasonal;
  });

  return scoreForecast(actual, predicted);
}

/** Compute MAE / RMSE / MAPE for aligned actual/predicted arrays. */
export function scoreForecast(actual: number[], predicted: number[]): BacktestMetrics {
  const n = Math.min(actual.length, predicted.length);
  if (n === 0) return { mae: 0, rmse: 0, mape: 0, sampleSize: 0 };

  let absErr = 0;
  let sqErr = 0;
  let pctErr = 0;
  let pctCount = 0;

  for (let i = 0; i < n; i++) {
    const a = actual[i]!;
    const p = predicted[i]!;
    const e = a - p;
    absErr += Math.abs(e);
    sqErr += e * e;
    // MAPE undefined when actual is 0 — skip those terms.
    if (a !== 0) {
      pctErr += Math.abs(e / a);
      pctCount++;
    }
  }

  return {
    mae: absErr / n,
    rmse: Math.sqrt(sqErr / n),
    mape: pctCount > 0 ? (pctErr / pctCount) * 100 : 0,
    sampleSize: n,
  };
}

// ─── Residual anomaly detection ───────────────────────────────────────────────

/**
 * Flag in-sample points whose model residual is a robust-z outlier. We use the
 * median-absolute-deviation-style scale (median + 1.4826·MAD) so a few large
 * spikes don't inflate σ and mask the others. A point is anomalous when its
 * |robust z| exceeds `k`. This threshold is intentionally independent of the
 * prediction-band coverage (`ciLevel`); `k` defaults to ~3.0, a conventional
 * outlier cutoff, not the 1.96 interval multiplier.
 */
export function detectResidualAnomalies(
  history: SeriesPoint[],
  fitted: number[],
  k = 3,
): ResidualAnomaly[] {
  const n = Math.min(history.length, fitted.length);
  if (n < 4) return [];

  // Residuals from index 1 onward (index 0 fits itself).
  const residuals: number[] = [];
  for (let t = 1; t < n; t++) residuals.push(history[t]!.value - fitted[t]!);

  const med = median(residuals);
  const absDev = residuals.map((r) => Math.abs(r - med));
  const mad = median(absDev);
  // 1.4826 makes MAD a consistent estimator of σ for normal data.
  const scale = mad > 0 ? mad * 1.4826 : stdDev(residuals, 1);
  if (scale === 0) return [];

  const out: ResidualAnomaly[] = [];
  for (let t = 1; t < n; t++) {
    const residual = history[t]!.value - fitted[t]!;
    const z = (residual - med) / scale;
    if (Math.abs(z) > k) {
      out.push({
        index: t,
        date: history[t]!.date,
        value: history[t]!.value,
        expected: fitted[t]!,
        residual,
        zScore: z,
      });
    }
  }
  return out.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
}

// ─── Internal builders for degenerate cases ───────────────────────────────────

function buildFlatForecast(
  history: SeriesPoint[],
  value: number,
  trend: number,
  opts: Required<ForecastOptions>,
): ForecastPoint[] {
  const lastDate = history[history.length - 1]?.date ?? "t";
  const out: ForecastPoint[] = [];
  for (let h = 1; h <= opts.horizon; h++) {
    const v = value + h * trend;
    out.push({ date: addDays(lastDate, h), value: v, lower: v, upper: v });
  }
  return out;
}

function emptyResult(history: SeriesPoint[]): ForecastResult {
  return {
    history,
    fitted: [],
    forecast: [],
    seasonalIndices: [0],
    residualStd: 0,
    level: 0,
    trend: 0,
    metrics: null,
    anomalies: [],
    degraded: true,
  };
}
