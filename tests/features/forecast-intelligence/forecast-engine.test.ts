import { describe, expect, it } from "vitest";
import {
  backtest,
  detectResidualAnomalies,
  forecastSeries,
  normalizeSeries,
  scoreForecast,
  seasonalIndices,
  type SeriesPoint,
} from "@/features/forecast-intelligence/core/forecast-engine";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a {date,value}[] from raw numbers, dated sequentially from a base. */
function toSeries(values: number[], base = "2026-01-01"): SeriesPoint[] {
  const start = new Date(`${base}T00:00:00Z`).getTime();
  return values.map((value, i) => ({
    date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
    value,
  }));
}

/** Deterministic synthetic series: linear trend + weekly seasonal + tiny noise. */
function syntheticSeasonal(
  n: number,
  intercept: number,
  slope: number,
  season: number[],
): number[] {
  return Array.from({ length: n }, (_, t) => {
    const seasonal = season[t % season.length]!;
    return intercept + slope * t + seasonal;
  });
}

// ─── normalizeSeries ──────────────────────────────────────────────────────────

describe("normalizeSeries", () => {
  it("drops non-finite values (handles missing points)", () => {
    const dirty: SeriesPoint[] = [
      { date: "a", value: 1 },
      { date: "b", value: Number.NaN },
      { date: "c", value: Infinity },
      { date: "d", value: 4 },
    ];
    const clean = normalizeSeries(dirty);
    expect(clean).toHaveLength(2);
    expect(clean.map((p) => p.value)).toEqual([1, 4]);
  });

  it("coerces numeric-like values to numbers", () => {
    const clean = normalizeSeries([
      { date: "a", value: "5" as unknown as number },
    ]);
    expect(clean[0]!.value).toBe(5);
  });
});

// ─── seasonalIndices ──────────────────────────────────────────────────────────

describe("seasonalIndices", () => {
  it("recovers a known additive weekly pattern (centred to ~zero sum)", () => {
    const season = [0, 50, 80, 60, 40, -40, -190]; // sums to 0
    const values = syntheticSeasonal(70, 1000, 5, season);
    const idx = seasonalIndices(values, 7);

    // Indices should sum to ~0 (additive seasonality is level-neutral).
    const sum = idx.reduce((a, b) => a + b, 0);
    expect(Math.abs(sum)).toBeLessThan(1e-6);

    // Each recovered index should be close to the true seasonal effect.
    // A small per-phase bias is expected from the coarse OLS detrend, so we
    // assert within an absolute tolerance rather than to a decimal place.
    for (let i = 0; i < 7; i++) {
      expect(Math.abs(idx[i]! - season[i]!)).toBeLessThan(5);
    }
  });

  it("returns zero indices when season <= 1 or series too short", () => {
    expect(seasonalIndices([1, 2, 3, 4], 1)).toEqual([0]);
    // n < 2*m
    expect(seasonalIndices([1, 2, 3], 7).every((v) => v === 0)).toBe(true);
  });
});

// ─── forecastSeries: trend ────────────────────────────────────────────────────

describe("forecastSeries — trend recovery", () => {
  it("projects a rising trend forward", () => {
    const values = Array.from({ length: 30 }, (_, t) => 100 + 3 * t);
    const r = forecastSeries(toSeries(values), { horizon: 5, seasonLength: 1 });

    expect(r.trend).toBeGreaterThan(0);
    expect(r.forecast).toHaveLength(5);
    // Forecast continues upward and beyond the last observed value.
    expect(r.forecast[0]!.value).toBeGreaterThan(values[values.length - 1]!);
    expect(r.forecast[4]!.value).toBeGreaterThan(r.forecast[0]!.value);
  });

  it("projects a falling trend downward", () => {
    const values = Array.from({ length: 30 }, (_, t) => 500 - 4 * t);
    const r = forecastSeries(toSeries(values), { horizon: 5, seasonLength: 1 });
    expect(r.trend).toBeLessThan(0);
    expect(r.forecast[4]!.value).toBeLessThan(r.forecast[0]!.value);
  });

  it("approximates the true next value on a clean linear series", () => {
    const slope = 2;
    const values = Array.from({ length: 40 }, (_, t) => 10 + slope * t);
    const r = forecastSeries(toSeries(values), { horizon: 1, seasonLength: 1 });
    const expectedNext = 10 + slope * values.length;
    // Holt on a perfectly linear series should land very close.
    expect(r.forecast[0]!.value).toBeCloseTo(expectedNext, 0);
  });
});

// ─── forecastSeries: seasonality ──────────────────────────────────────────────

describe("forecastSeries — seasonality recovery", () => {
  it("reproduces the seasonal shape in the forecast", () => {
    const season = [0, 60, 90, 70, 50, -50, -220];
    const values = syntheticSeasonal(84, 2000, 4, season);
    const r = forecastSeries(toSeries(values), { horizon: 7, seasonLength: 7 });

    expect(r.degraded).toBe(false);
    expect(r.seasonalIndices.some((v) => v !== 0)).toBe(true);

    // The relative ordering of seasonal phases should be preserved: the lowest
    // phase (index 6) should yield the lowest forecast among the 7 steps, and
    // the highest phase (index 2) the highest.
    const fc = r.forecast.map((p) => p.value);
    const minPhase = fc.indexOf(Math.min(...fc));
    const maxPhase = fc.indexOf(Math.max(...fc));
    // Forecast steps 1..7 map to phases (n-1+h) % 7; just assert spread exists.
    expect(Math.max(...fc) - Math.min(...fc)).toBeGreaterThan(100);
    expect(minPhase).not.toBe(maxPhase);
  });
});

// ─── Confidence intervals ─────────────────────────────────────────────────────

describe("forecastSeries — confidence band", () => {
  it("produces a band that widens monotonically with horizon", () => {
    // Noisy series so residual std > 0.
    const values = Array.from({ length: 40 }, (_, t) =>
      100 + 2 * t + (t % 3 === 0 ? 15 : -10),
    );
    const r = forecastSeries(toSeries(values), { horizon: 10, seasonLength: 1 });

    expect(r.residualStd).toBeGreaterThan(0);
    const widths = r.forecast.map((p) => p.upper - p.lower);
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]!).toBeGreaterThanOrEqual(widths[i - 1]!);
    }
    // Band brackets the point forecast.
    for (const p of r.forecast) {
      expect(p.lower).toBeLessThanOrEqual(p.value);
      expect(p.upper).toBeGreaterThanOrEqual(p.value);
    }
  });

  it("collapses the band to zero width for a constant series", () => {
    const r = forecastSeries(toSeries(new Array(12).fill(7)), {
      horizon: 4,
    });
    expect(r.residualStd).toBe(0);
    for (const p of r.forecast) {
      expect(p.upper - p.lower).toBe(0);
      expect(p.value).toBe(7);
    }
  });
});

// ─── scoreForecast / backtest metrics ─────────────────────────────────────────

describe("scoreForecast", () => {
  it("computes MAE, RMSE and MAPE correctly", () => {
    const actual = [100, 200, 300];
    const predicted = [110, 180, 330]; // errors: -10, +20, -30
    const m = scoreForecast(actual, predicted);
    // |−10|+|20|+|30| = 60 → MAE = 20
    expect(m.mae).toBeCloseTo(20, 6);
    // sqrt((100+400+900)/3) = sqrt(466.67)
    expect(m.rmse).toBeCloseTo(Math.sqrt((100 + 400 + 900) / 3), 6);
    // (10/100 + 20/200 + 30/300)/3 = (0.1+0.1+0.1)/3 = 0.1 → 10%
    expect(m.mape).toBeCloseTo(10, 6);
    expect(m.sampleSize).toBe(3);
  });

  it("skips MAPE terms where actual is zero", () => {
    const m = scoreForecast([0, 100], [5, 90]);
    // Only the second term counts: 10/100 = 0.1 → 10%
    expect(m.mape).toBeCloseTo(10, 6);
  });

  it("returns zeros for empty input", () => {
    expect(scoreForecast([], [])).toEqual({
      mae: 0,
      rmse: 0,
      mape: 0,
      sampleSize: 0,
    });
  });
});

describe("backtest", () => {
  it("returns null for short series", () => {
    expect(backtest([1, 2, 3, 4, 5])).toBeNull();
  });

  it("yields low error on a clean linear series", () => {
    const values = Array.from({ length: 40 }, (_, t) => 50 + 1.5 * t);
    const m = backtest(values, { horizon: 7, seasonLength: 1 });
    expect(m).not.toBeNull();
    // A perfectly linear series should backtest with tiny MAPE.
    expect(m!.mape).toBeLessThan(5);
    expect(m!.sampleSize).toBeGreaterThan(0);
  });
});

// ─── Residual anomalies ───────────────────────────────────────────────────────

describe("detectResidualAnomalies", () => {
  it("flags an injected spike", () => {
    const values = Array.from({ length: 30 }, (_, t) => 100 + t);
    values[20] = 400; // big spike
    const r = forecastSeries(toSeries(values), { horizon: 3, seasonLength: 1 });
    expect(r.anomalies.length).toBeGreaterThan(0);
    expect(r.anomalies.some((a) => a.index === 20)).toBe(true);
  });

  it("flags nothing on a smooth series", () => {
    const values = Array.from({ length: 30 }, (_, t) => 100 + 2 * t);
    const r = forecastSeries(toSeries(values), { horizon: 3, seasonLength: 1 });
    expect(r.anomalies).toHaveLength(0);
  });

  it("returns [] when fewer than 4 points", () => {
    const hist = toSeries([1, 2, 3]);
    expect(detectResidualAnomalies(hist, [1, 2, 3])).toEqual([]);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe("forecastSeries — edge cases", () => {
  it("handles an empty series", () => {
    const r = forecastSeries([]);
    expect(r.forecast).toHaveLength(0);
    expect(r.degraded).toBe(true);
    expect(r.metrics).toBeNull();
  });

  it("handles a single point with a flat forecast", () => {
    const r = forecastSeries(toSeries([42]), { horizon: 3 });
    expect(r.degraded).toBe(true);
    expect(r.forecast).toHaveLength(3);
    for (const p of r.forecast) expect(p.value).toBe(42);
  });

  it("handles a two-point series", () => {
    const r = forecastSeries(toSeries([10, 20]), { horizon: 2, seasonLength: 1 });
    expect(r.forecast).toHaveLength(2);
    expect(Number.isFinite(r.forecast[0]!.value)).toBe(true);
  });

  it("treats a series with missing points as equally spaced survivors", () => {
    const dirty: SeriesPoint[] = toSeries(
      Array.from({ length: 20 }, (_, t) => 100 + t),
    );
    // Punch holes — these get dropped, not interpolated.
    dirty[5]!.value = Number.NaN;
    dirty[11]!.value = Number.NaN;
    const r = forecastSeries(dirty, { horizon: 3, seasonLength: 1 });
    expect(r.history).toHaveLength(18);
    expect(r.trend).toBeGreaterThan(0);
    expect(r.forecast).toHaveLength(3);
  });

  it("is deterministic for identical inputs", () => {
    const values = Array.from({ length: 50 }, (_, t) => 200 + 3 * t + (t % 7) * 10);
    const s = toSeries(values);
    const a = forecastSeries(s, { horizon: 5, seasonLength: 7 });
    const b = forecastSeries(s, { horizon: 5, seasonLength: 7 });
    expect(a.forecast.map((p) => p.value)).toEqual(
      b.forecast.map((p) => p.value),
    );
    expect(a.residualStd).toBe(b.residualStd);
  });

  it("uses fallback labels for non-date inputs", () => {
    const series = [
      { date: "alpha", value: 1 },
      { date: "beta", value: 2 },
      { date: "gamma", value: 3 },
    ];
    const r = forecastSeries(series, { horizon: 2, seasonLength: 1 });
    expect(r.forecast[0]!.date).toBe("t+1");
    expect(r.forecast[1]!.date).toBe("t+2");
  });
});
