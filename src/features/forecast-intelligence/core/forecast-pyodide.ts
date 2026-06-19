/**
 * Pyodide-backed forecast enhancement.
 *
 * When the Python sandbox is available this produces a stronger forecast than
 * the pure-TS engine by running the math in scikit-learn (Holt-Winters-style
 * exponential smoothing via statsmodels when installable, else a polynomial /
 * linear trend through the existing `linearTrendSklearn` helper).
 *
 * Mirrors the contract in `pyodide-ml.ts`: every export returns `null` when
 * Pyodide / sklearn is unavailable so the caller can fall back to
 * `forecastSeries` from `./forecast-engine`. No "use client" — this module ends
 * up calling the sandbox worker which requires a browser context at runtime.
 */

import { linearTrendSklearn } from "@/platform/ai/pyodide-ml";
import {
  ensureSandboxReady,
  installPackages,
  loadDataFrame,
  runPython,
} from "@/platform/python-sandbox/core";
import type {
  ForecastOptions,
  ForecastPoint,
  ForecastResult,
  SeriesPoint,
} from "./forecast-engine";
import {
  backtest,
  detectResidualAnomalies,
  normalizeSeries,
  normalQuantile,
} from "./forecast-engine";

const FORECAST_SESSION = "pyodide-forecast";

let statsmodelsReady: boolean | null = null;
let smInitPromise: Promise<boolean> | null = null;

/**
 * Try to make statsmodels available in the sandbox. Idempotent; caches the
 * outcome. Returns false (rather than throwing) on any failure so callers can
 * silently fall back to the sklearn trend path.
 */
async function ensureStatsmodels(onProgress?: (s: string) => void): Promise<boolean> {
  if (statsmodelsReady !== null) return statsmodelsReady;
  if (smInitPromise) return smInitPromise;

  smInitPromise = (async (): Promise<boolean> => {
    try {
      await ensureSandboxReady(onProgress);
      onProgress?.("Loading statsmodels…");
      // statsmodels (with numpy/scipy/pandas) ships as a PREBUILT Pyodide
      // package and must be resolved from the runtime's package index — not
      // installed from PyPI via micropip. The sandbox's INSTALL handler is
      // responsible for using `loadPackage` for these so the advanced tier can
      // work offline once the Pyodide runtime is self-hosted. We request scipy
      // explicitly because statsmodels depends on it.
      await installPackages(
        FORECAST_SESSION,
        ["numpy", "scipy", "pandas", "statsmodels"],
        onProgress,
      );
      const { stderr } = await runPython("import statsmodels.api as sm", {
        sessionId: FORECAST_SESSION,
        onProgress,
      });
      if (stderr?.trim()) onProgress?.(`statsmodels warnings: ${stderr.trim()}`);
      statsmodelsReady = true;
      onProgress?.("statsmodels ready");
      return true;
    } catch {
      // Advanced tier unavailable (e.g. the Pyodide runtime/wheels are not
      // self-hosted yet, so they can't be fetched offline). This is a recover-
      // able fallback, not an error: callers degrade to the sklearn trend path
      // and ultimately the always-available pure-TS engine.
      onProgress?.("Advanced model unavailable offline — using built-in engine");
      statsmodelsReady = false;
      smInitPromise = null;
      return false;
    }
  })();

  return smInitPromise;
}

interface SmForecast {
  fitted: number[];
  forecast: number[];
  /** Residual std reported by the model. */
  residualStd: number;
  level: number;
  trend: number;
}

/**
 * Holt-Winters (additive trend + optional additive seasonal) via statsmodels'
 * `ExponentialSmoothing`. Returns null if statsmodels can't be loaded or the
 * fit fails.
 */
async function holtWintersStatsmodels(
  values: number[],
  opts: Required<ForecastOptions>,
  onProgress?: (s: string) => void,
): Promise<SmForecast | null> {
  try {
    const ready = await ensureStatsmodels(onProgress);
    if (!ready) return null;
    if (values.length < 2 * opts.seasonLength) {
      // Not enough data for a seasonal HW fit; let the trend path handle it.
      return null;
    }

    await loadDataFrame(
      FORECAST_SESSION,
      "df_y",
      values.map((v, i) => ({ t: i, y: v })),
      onProgress,
    );

    const useSeasonal = opts.seasonLength > 1 ? "True" : "False";
    const code = `
from statsmodels.tsa.holtwinters import ExponentialSmoothing
import numpy as np

y = df_y["y"].values.astype(float)
m = ${opts.seasonLength}
horizon = ${opts.horizon}
use_seasonal = ${useSeasonal}

kwargs = {"trend": "add", "initialization_method": "estimated"}
if use_seasonal and len(y) >= 2 * m:
    kwargs["seasonal"] = "add"
    kwargs["seasonal_periods"] = m

model = ExponentialSmoothing(y, **kwargs)
fit = model.fit(optimized=True)

fitted = fit.fittedvalues.tolist()
forecast = fit.forecast(horizon).tolist()
resid = (y - fit.fittedvalues)
residual_std = float(np.std(resid, ddof=1)) if len(resid) > 1 else 0.0

# Recover level/trend from the smoothed state when available.
try:
    level = float(fit.level[-1])
except Exception:
    level = float(fitted[-1]) if fitted else 0.0
try:
    trend = float(fit.trend[-1])
except Exception:
    trend = 0.0

{
  "fitted": [float(x) for x in fitted],
  "forecast": [float(x) for x in forecast],
  "residualStd": residual_std,
  "level": level,
  "trend": trend,
}
`.trim();

    const result = await runPython(code, {
      sessionId: FORECAST_SESSION,
      onProgress,
    });
    const v = result.value as SmForecast | null;
    if (!v || !Array.isArray(v.forecast) || v.forecast.length === 0) return null;
    return v;
  } catch {
    return null;
  }
}

/**
 * Produce a forecast using Pyodide when available, returning a `ForecastResult`
 * shaped identically to the pure engine, or `null` to signal "fall back to the
 * pure-TS engine". Tries statsmodels Holt-Winters first; if that's unavailable
 * it uses the sklearn linear-trend helper (`linearTrendSklearn`) and still
 * returns a complete, CI-banded result.
 */
export async function forecastSeriesPyodide(
  rawSeries: SeriesPoint[],
  options: ForecastOptions = {},
  onProgress?: (s: string) => void,
): Promise<ForecastResult | null> {
  try {
    const ciLevel = options.ciLevel ?? 0.95;
    const opts: Required<ForecastOptions> = {
      horizon: options.horizon ?? 7,
      seasonLength: options.seasonLength ?? 7,
      alpha: options.alpha ?? 0.4,
      beta: options.beta ?? 0.1,
      // Effective band multiplier: explicit `ci` wins, else derive z from the
      // coverage level (matches the pure engine's decoupled convention).
      ci: options.ci ?? normalQuantile(0.5 + Math.min(0.999999, Math.max(0.5, ciLevel)) / 2),
      ciLevel,
      anomalyZ: options.anomalyZ ?? 3,
    };

    const history = normalizeSeries(rawSeries);
    const values = history.map((p) => p.value);
    const n = values.length;
    if (n < 3) return null; // too short to be worth the sandbox round-trip

    const lastDate = history[n - 1]!.date;

    // ── Path 1: statsmodels Holt-Winters (strongest) ──────────────────────────
    const sm = await holtWintersStatsmodels(values, opts, onProgress);
    if (sm) {
      const fitted = padFitted(sm.fitted, values);
      const forecast = buildBandedForecast(sm.forecast, sm.residualStd, opts.ci, lastDate);
      return assemble(history, fitted, forecast, sm.residualStd, sm.level, sm.trend, values, opts);
    }

    // ── Path 2: sklearn linear/poly trend (still better-than-nothing) ─────────
    const trend = await linearTrendSklearn(values, opts.horizon);
    if (trend) {
      // Reconstruct in-sample fit from the regression line for honest residuals.
      const fitted = values.map((_, t) => trend.intercept + trend.slope * t);
      const residuals = values.map((y, t) => y - fitted[t]!);
      const residualStd = sampleStd(residuals);
      const forecast = buildBandedForecast(trend.forecast, residualStd, opts.ci, lastDate);
      const level = fitted[n - 1]!;
      return assemble(history, fitted, forecast, residualStd, level, trend.slope, values, opts);
    }

    // Neither python path was available.
    return null;
  } catch {
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function assemble(
  history: SeriesPoint[],
  fitted: number[],
  forecast: ForecastPoint[],
  residualStd: number,
  level: number,
  trend: number,
  values: number[],
  opts: Required<ForecastOptions>,
): ForecastResult {
  return {
    history,
    fitted,
    forecast,
    // Pyodide paths fold seasonality into the model internally; we expose an
    // empty index set so consumers know not to double-apply it.
    seasonalIndices: [0],
    residualStd,
    level,
    trend,
    metrics: backtest(values, opts),
    anomalies: detectResidualAnomalies(history, fitted, opts.anomalyZ),
    degraded: false,
  };
}

/** Convert a forecast value array into CI-banded ForecastPoints (√h widening). */
function buildBandedForecast(
  forecastValues: number[],
  residualStd: number,
  ci: number,
  lastDate: string,
): ForecastPoint[] {
  return forecastValues.map((value, i) => {
    const h = i + 1;
    const halfWidth = ci * residualStd * Math.sqrt(h);
    return {
      date: addDays(lastDate, h),
      value,
      lower: value - halfWidth,
      upper: value + halfWidth,
    };
  });
}

/**
 * statsmodels can return fewer fitted values than observations (it drops the
 * seasonal warm-up). Left-pad with the actual values so `fitted` stays index-
 * aligned to `history` (the warm-up points then contribute zero residual).
 */
function padFitted(fitted: number[], values: number[]): number[] {
  if (fitted.length >= values.length) return fitted.slice(0, values.length);
  const pad = values.length - fitted.length;
  return [...values.slice(0, pad), ...fitted];
}

function sampleStd(xs: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / n;
  let acc = 0;
  for (const x of xs) acc += (x - m) ** 2;
  return Math.sqrt(acc / (n - 1));
}

function addDays(isoDate: string, n: number): string {
  const base = new Date(isoDate);
  if (Number.isNaN(base.getTime())) return `t+${n}`;
  return new Date(base.getTime() + n * 86_400_000).toISOString().slice(0, 10);
}
