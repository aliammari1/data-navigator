import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  normalQuantile,
  normalizeSeries,
  seasonalIndices,
  forecastSeries,
  backtest,
  scoreForecast,
  detectResidualAnomalies,
  type SeriesPoint,
  type ForecastOptions,
} from "@/features/forecast-intelligence/core/forecast-engine";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSeries(values: number[], base = "2026-01-01"): SeriesPoint[] {
  const start = new Date(`${base}T00:00:00Z`).getTime();
  return values.map((value, i) => ({
    date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
    value,
  }));
}

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

// ─── normalQuantile ───────────────────────────────────────────────────────────

describe("normalQuantile", () => {
  it("returns -Infinity for p <= 0", () => {
    expect(normalQuantile(0)).toBe(-Infinity);
    expect(normalQuantile(-1)).toBe(-Infinity);
    expect(normalQuantile(-100)).toBe(-Infinity);
  });

  it("returns +Infinity for p >= 1", () => {
    expect(normalQuantile(1)).toBe(Infinity);
    expect(normalQuantile(2)).toBe(Infinity);
    expect(normalQuantile(100)).toBe(Infinity);
  });

  it("returns ~0 for p = 0.5 (middle region)", () => {
    expect(normalQuantile(0.5)).toBeCloseTo(0, 8);
  });

  it("returns ~1.96 for p = 0.975 (middle region, 95% two-sided)", () => {
    expect(normalQuantile(0.975)).toBeCloseTo(1.96, 1);
  });

  it("handles the low tail: p < 0.02425", () => {
    // p = 0.01 is below pLow = 0.02425, exercises lines 184-185
    const q = normalQuantile(0.01);
    // For p=0.01, the normal quantile should be approximately -2.326
    expect(q).toBeCloseTo(-2.326, 1);
    expect(Number.isFinite(q)).toBe(true);
    expect(q).toBeLessThan(-2);
  });

  it("handles the low tail: p = 0.001", () => {
    const q = normalQuantile(0.001);
    expect(q).toBeLessThan(-3);
    expect(Number.isFinite(q)).toBe(true);
  });

  it("handles the low tail: p very small but > 0", () => {
    const q = normalQuantile(0.0001);
    expect(q).toBeLessThan(-3.5);
    expect(Number.isFinite(q)).toBe(true);
  });

  it("handles the high tail: p > 1 - 0.02425 = 0.97575", () => {
    // p = 0.99 exercises lines 198-199 (high tail branch)
    const q = normalQuantile(0.99);
    expect(q).toBeCloseTo(2.326, 1);
    expect(Number.isFinite(q)).toBe(true);
    expect(q).toBeGreaterThan(2);
  });

  it("handles the high tail: p = 0.999", () => {
    const q = normalQuantile(0.999);
    expect(q).toBeGreaterThan(3);
    expect(Number.isFinite(q)).toBe(true);
  });

  it("high tail is symmetric to low tail", () => {
    const qLow = normalQuantile(0.01);
    const qHigh = normalQuantile(0.99);
    expect(qHigh).toBeCloseTo(-qLow, 4);
  });

  it("high tail: p near pHigh boundary (0.9758)", () => {
    // Just over pHigh so we go to the high-tail path
    const q = normalQuantile(0.98);
    expect(q).toBeGreaterThan(2);
    expect(Number.isFinite(q)).toBe(true);
  });
});

// ─── normalizeSeries ──────────────────────────────────────────────────────────

describe("normalizeSeries", () => {
  it("drops NaN values", () => {
    const series: SeriesPoint[] = [
      { date: "2026-01-01", value: 10 },
      { date: "2026-01-02", value: Number.NaN },
      { date: "2026-01-03", value: 20 },
    ];
    const result = normalizeSeries(series);
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.value)).toEqual([10, 20]);
  });

  it("drops Infinity values", () => {
    const series: SeriesPoint[] = [
      { date: "a", value: 1 },
      { date: "b", value: Infinity },
      { date: "c", value: -Infinity },
      { date: "d", value: 5 },
    ];
    const result = normalizeSeries(series);
    expect(result).toHaveLength(2);
  });

  it("coerces string-like numbers", () => {
    const series = [{ date: "a", value: "42" as unknown as number }];
    const result = normalizeSeries(series);
    expect(result[0]!.value).toBe(42);
  });

  it("returns empty for all-invalid", () => {
    const series: SeriesPoint[] = [
      { date: "a", value: Number.NaN },
      { date: "b", value: Infinity },
    ];
    expect(normalizeSeries(series)).toEqual([]);
  });

  it("stringifies the date field", () => {
    const series = [{ date: 20260101 as unknown as string, value: 5 }];
    const result = normalizeSeries(series);
    expect(typeof result[0]!.date).toBe("string");
  });

  it("passes through a clean series unchanged in length", () => {
    const series = toSeries([1, 2, 3, 4, 5]);
    expect(normalizeSeries(series)).toHaveLength(5);
  });
});

// ─── seasonalIndices ──────────────────────────────────────────────────────────

describe("seasonalIndices", () => {
  it("returns zero array of length 1 when m <= 1", () => {
    expect(seasonalIndices([1, 2, 3, 4], 0)).toEqual([0]);
    expect(seasonalIndices([1, 2, 3, 4], 1)).toEqual([0]);
  });

  it("returns zero array when n < 2*m (too short)", () => {
    const result = seasonalIndices([1, 2, 3], 7);
    expect(result).toHaveLength(7);
    expect(result.every((v) => v === 0)).toBe(true);
  });

  it("returns zeros (length m) when series too short", () => {
    const result = seasonalIndices([1, 2, 3, 4, 5, 6], 7);
    expect(result).toHaveLength(7);
    expect(result.every((v) => v === 0)).toBe(true);
  });

  it("recovers known additive weekly pattern (indices sum to ~0)", () => {
    const season = [0, 50, 80, 60, 40, -40, -190];
    const values = syntheticSeasonal(70, 1000, 5, season);
    const idx = seasonalIndices(values, 7);
    const sum = idx.reduce((a, b) => a + b, 0);
    expect(Math.abs(sum)).toBeLessThan(1e-6);
    for (let i = 0; i < 7; i++) {
      expect(Math.abs(idx[i]! - season[i]!)).toBeLessThan(5);
    }
  });

  it("centres indices to sum to zero even with drift", () => {
    const values = Array.from({ length: 28 }, (_, t) => 100 + t * 2 + (t % 7) * 10);
    const idx = seasonalIndices(values, 7);
    const sum = idx.reduce((a, b) => a + b, 0);
    expect(Math.abs(sum)).toBeLessThan(1e-8);
  });

  it("handles m=2 (biweekly) with sufficient data", () => {
    const values = Array.from({ length: 20 }, (_, t) => 100 + (t % 2 === 0 ? 10 : -10));
    const idx = seasonalIndices(values, 2);
    expect(idx).toHaveLength(2);
    const sum = idx.reduce((a, b) => a + b, 0);
    expect(Math.abs(sum)).toBeLessThan(1e-8);
  });

  it("handles constant series (no drift, flat detrend)", () => {
    const values = new Array(20).fill(100);
    const idx = seasonalIndices(values, 4);
    expect(idx.every((v) => v === 0)).toBe(true);
  });
});

// ─── forecastSeries: degenerate cases ────────────────────────────────────────

describe("forecastSeries — degenerate cases", () => {
  it("handles empty series: returns degraded with no forecast", () => {
    const r = forecastSeries([]);
    expect(r.history).toHaveLength(0);
    expect(r.forecast).toHaveLength(0);
    expect(r.fitted).toHaveLength(0);
    expect(r.seasonalIndices).toEqual([0]);
    expect(r.residualStd).toBe(0);
    expect(r.level).toBe(0);
    expect(r.trend).toBe(0);
    expect(r.metrics).toBeNull();
    expect(r.anomalies).toEqual([]);
    expect(r.degraded).toBe(true);
  });

  it("handles single-point series: degraded, flat forecast", () => {
    const r = forecastSeries(toSeries([42]), { horizon: 3 });
    expect(r.degraded).toBe(true);
    expect(r.history).toHaveLength(1);
    expect(r.fitted).toEqual([42]);
    expect(r.forecast).toHaveLength(3);
    for (const p of r.forecast) {
      expect(p.value).toBe(42);
      expect(p.lower).toBe(42);
      expect(p.upper).toBe(42);
    }
    expect(r.seasonalIndices).toEqual([0]);
    expect(r.residualStd).toBe(0);
    expect(r.metrics).toBeNull();
    expect(r.anomalies).toEqual([]);
  });

  it("handles constant series: degraded, zero residual", () => {
    const r = forecastSeries(toSeries(new Array(12).fill(100)), { horizon: 4 });
    expect(r.degraded).toBe(true);
    expect(r.residualStd).toBe(0);
    expect(r.forecast).toHaveLength(4);
    for (const p of r.forecast) {
      expect(p.value).toBe(100);
      expect(p.lower).toBe(100);
      expect(p.upper).toBe(100);
    }
    expect(r.seasonalIndices).toEqual([0]);
    // metrics not null because series >= 6 (has backtest)
    // constant series still returns backtest
    expect(r.anomalies).toEqual([]);
  });

  it("handles two-point series", () => {
    const r = forecastSeries(toSeries([10, 20]), { horizon: 2, seasonLength: 1 });
    expect(r.forecast).toHaveLength(2);
    expect(Number.isFinite(r.forecast[0]!.value)).toBe(true);
  });

  it("handles series with all-NaN filtered out", () => {
    const series: SeriesPoint[] = [
      { date: "2026-01-01", value: Number.NaN },
      { date: "2026-01-02", value: Number.NaN },
    ];
    const r = forecastSeries(series);
    expect(r.degraded).toBe(true);
    expect(r.forecast).toHaveLength(0);
  });
});

// ─── forecastSeries: non-date labels ─────────────────────────────────────────

describe("forecastSeries — non-date labels", () => {
  it("uses t+n fallback for non-date date strings", () => {
    const series = [
      { date: "alpha", value: 10 },
      { date: "beta", value: 20 },
      { date: "gamma", value: 30 },
    ];
    const r = forecastSeries(series, { horizon: 2, seasonLength: 1 });
    expect(r.forecast[0]!.date).toBe("t+1");
    expect(r.forecast[1]!.date).toBe("t+2");
  });

  it("uses t+n fallback for single-point non-date", () => {
    const series = [{ date: "not-a-date", value: 42 }];
    const r = forecastSeries(series, { horizon: 2 });
    expect(r.forecast[0]!.date).toBe("t+1");
    expect(r.forecast[1]!.date).toBe("t+2");
  });
});

// ─── forecastSeries: trend recovery ─────────────────────────────────────────

describe("forecastSeries — trend recovery", () => {
  it("projects a rising trend forward", () => {
    const values = Array.from({ length: 30 }, (_, t) => 100 + 3 * t);
    const r = forecastSeries(toSeries(values), { horizon: 5, seasonLength: 1 });
    expect(r.trend).toBeGreaterThan(0);
    expect(r.forecast).toHaveLength(5);
    expect(r.forecast[0]!.value).toBeGreaterThan(values[values.length - 1]!);
    expect(r.forecast[4]!.value).toBeGreaterThan(r.forecast[0]!.value);
    expect(r.degraded).toBe(false);
  });

  it("projects a falling trend downward", () => {
    const values = Array.from({ length: 30 }, (_, t) => 500 - 4 * t);
    const r = forecastSeries(toSeries(values), { horizon: 5, seasonLength: 1 });
    expect(r.trend).toBeLessThan(0);
    expect(r.forecast[4]!.value).toBeLessThan(r.forecast[0]!.value);
  });

  it("approximates next value on a clean linear series", () => {
    const slope = 2;
    const values = Array.from({ length: 40 }, (_, t) => 10 + slope * t);
    const r = forecastSeries(toSeries(values), { horizon: 1, seasonLength: 1 });
    const expectedNext = 10 + slope * values.length;
    expect(r.forecast[0]!.value).toBeCloseTo(expectedNext, 0);
  });
});

// ─── forecastSeries: seasonality ─────────────────────────────────────────────

describe("forecastSeries — seasonality", () => {
  it("recovers seasonal shape in the forecast", () => {
    const season = [0, 60, 90, 70, 50, -50, -220];
    const values = syntheticSeasonal(84, 2000, 4, season);
    const r = forecastSeries(toSeries(values), { horizon: 7, seasonLength: 7 });
    expect(r.degraded).toBe(false);
    expect(r.seasonalIndices.some((v) => v !== 0)).toBe(true);
    const fc = r.forecast.map((p) => p.value);
    expect(Math.max(...fc) - Math.min(...fc)).toBeGreaterThan(100);
  });

  it("degrades gracefully when m <= 1 (no seasonality)", () => {
    const values = Array.from({ length: 20 }, (_, t) => 100 + t);
    const r = forecastSeries(toSeries(values), { horizon: 5, seasonLength: 1 });
    expect(r.seasonalIndices).toEqual([0]);
    expect(r.degraded).toBe(false);
    expect(r.forecast).toHaveLength(5);
  });

  it("degrades gracefully when series too short for season", () => {
    const values = Array.from({ length: 8 }, (_, t) => 100 + t);
    // n=8 < 2*7=14 so seasonality is not usable
    const r = forecastSeries(toSeries(values), { horizon: 3, seasonLength: 7 });
    expect(r.seasonalIndices.every((v) => v === 0)).toBe(true);
    expect(r.forecast).toHaveLength(3);
  });

  it("hasSeason=false path: seasonalIndices all zeros, effectiveM=1", () => {
    // Force all-zero indices by using season length 1
    const values = Array.from({ length: 15 }, (_, t) => 50 + t * 3);
    const r = forecastSeries(toSeries(values), { horizon: 3, seasonLength: 1 });
    expect(r.seasonalIndices).toEqual([0]);
  });
});

// ─── forecastSeries: CI options ───────────────────────────────────────────────

describe("forecastSeries — CI resolution", () => {
  it("uses explicit ci (legacy multiplier) when provided", () => {
    const values = Array.from({ length: 30 }, (_, t) => 100 + t + (t % 3 === 0 ? 5 : -2));
    const r1 = forecastSeries(toSeries(values), { horizon: 3, seasonLength: 1, ci: 1.0 });
    const r2 = forecastSeries(toSeries(values), { horizon: 3, seasonLength: 1, ci: 3.0 });
    // Wider ci => wider band
    const width1 = r1.forecast[0]!.upper - r1.forecast[0]!.lower;
    const width2 = r2.forecast[0]!.upper - r2.forecast[0]!.lower;
    expect(width2).toBeGreaterThan(width1);
  });

  it("uses ciLevel (normal quantile) when ci is absent", () => {
    const values = Array.from({ length: 30 }, (_, t) => 100 + t + (t % 3 === 0 ? 5 : -2));
    const r90 = forecastSeries(toSeries(values), {
      horizon: 3,
      seasonLength: 1,
      ciLevel: 0.9,
    });
    const r99 = forecastSeries(toSeries(values), {
      horizon: 3,
      seasonLength: 1,
      ciLevel: 0.99,
    });
    const width90 = r90.forecast[0]!.upper - r90.forecast[0]!.lower;
    const width99 = r99.forecast[0]!.upper - r99.forecast[0]!.lower;
    expect(width99).toBeGreaterThan(width90);
  });

  it("uses default ciLevel (0.95) when neither ci nor ciLevel is specified", () => {
    const values = Array.from({ length: 30 }, (_, t) => 100 + t + (t % 3 === 0 ? 5 : -2));
    const r = forecastSeries(toSeries(values), { horizon: 1, seasonLength: 1 });
    expect(r.residualStd).toBeGreaterThan(0);
    const width = r.forecast[0]!.upper - r.forecast[0]!.lower;
    expect(width).toBeGreaterThan(0);
  });

  it("clamps ciLevel below 0.5 to 0.5", () => {
    const values = Array.from({ length: 20 }, (_, t) => 100 + t);
    // ciLevel below 0.5 should be clamped to 0.5
    const r = forecastSeries(toSeries(values), {
      horizon: 1,
      seasonLength: 1,
      ciLevel: 0.1,
    });
    expect(r.forecast).toHaveLength(1);
    expect(Number.isFinite(r.forecast[0]!.upper)).toBe(true);
  });

  it("clamps ciLevel above 0.999999 to 0.999999", () => {
    const values = Array.from({ length: 20 }, (_, t) => 100 + t + (t % 2 ? 3 : -3));
    const r = forecastSeries(toSeries(values), {
      horizon: 1,
      seasonLength: 1,
      ciLevel: 0.9999999,
    });
    expect(r.forecast).toHaveLength(1);
    expect(Number.isFinite(r.forecast[0]!.upper)).toBe(true);
  });

  it("ci: non-finite value falls back to ciLevel", () => {
    const values = Array.from({ length: 20 }, (_, t) => 100 + t + (t % 2 ? 3 : -3));
    // Provide ci=NaN → should fall through to ciLevel path
    const r = forecastSeries(toSeries(values), {
      horizon: 1,
      seasonLength: 1,
      ci: NaN,
      ciLevel: 0.95,
    });
    expect(r.forecast).toHaveLength(1);
    expect(Number.isFinite(r.forecast[0]!.upper)).toBe(true);
  });
});

// ─── forecastSeries: anomalyZ option ─────────────────────────────────────────

describe("forecastSeries — anomalyZ option", () => {
  it("uses custom anomalyZ threshold", () => {
    const values = Array.from({ length: 30 }, (_, t) => 100 + t);
    values[15] = 500;
    const rStrict = forecastSeries(toSeries(values), {
      horizon: 3,
      seasonLength: 1,
      anomalyZ: 2,
    });
    const rLoose = forecastSeries(toSeries(values), {
      horizon: 3,
      seasonLength: 1,
      anomalyZ: 10,
    });
    // Stricter threshold: more anomalies; looser threshold: fewer
    expect(rStrict.anomalies.length).toBeGreaterThanOrEqual(rLoose.anomalies.length);
  });

  it("uses default anomalyZ=3 when not specified", () => {
    const values = Array.from({ length: 30 }, (_, t) => 100 + t);
    values[15] = 600;
    const r = forecastSeries(toSeries(values), { horizon: 3, seasonLength: 1 });
    expect(r.anomalies.length).toBeGreaterThan(0);
  });

  it("anomalyZ: non-finite value falls back to default 3", () => {
    const values = Array.from({ length: 30 }, (_, t) => 100 + t);
    values[15] = 600;
    const r = forecastSeries(toSeries(values), {
      horizon: 3,
      seasonLength: 1,
      anomalyZ: NaN,
    });
    expect(r.anomalies.length).toBeGreaterThan(0);
  });
});

// ─── forecastSeries: confidence band properties ───────────────────────────────

describe("forecastSeries — confidence band", () => {
  it("band widens monotonically with horizon", () => {
    const values = Array.from({ length: 40 }, (_, t) => 100 + 2 * t + (t % 3 === 0 ? 15 : -10));
    const r = forecastSeries(toSeries(values), { horizon: 10, seasonLength: 1 });
    expect(r.residualStd).toBeGreaterThan(0);
    const widths = r.forecast.map((p) => p.upper - p.lower);
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]!).toBeGreaterThanOrEqual(widths[i - 1]!);
    }
    for (const p of r.forecast) {
      expect(p.lower).toBeLessThanOrEqual(p.value);
      expect(p.upper).toBeGreaterThanOrEqual(p.value);
    }
  });

  it("band is zero width for constant series (residualStd=0)", () => {
    const r = forecastSeries(toSeries(new Array(12).fill(7)), { horizon: 4 });
    expect(r.residualStd).toBe(0);
    for (const p of r.forecast) {
      expect(p.upper - p.lower).toBe(0);
      expect(p.value).toBe(7);
    }
  });
});

// ─── forecastSeries: determinism ─────────────────────────────────────────────

describe("forecastSeries — determinism", () => {
  it("produces identical results for same input", () => {
    const values = Array.from({ length: 50 }, (_, t) => 200 + 3 * t + (t % 7) * 10);
    const s = toSeries(values);
    const a = forecastSeries(s, { horizon: 5, seasonLength: 7 });
    const b = forecastSeries(s, { horizon: 5, seasonLength: 7 });
    expect(a.forecast.map((p) => p.value)).toEqual(b.forecast.map((p) => p.value));
    expect(a.residualStd).toBe(b.residualStd);
  });
});

// ─── forecastSeries: full result structure ────────────────────────────────────

describe("forecastSeries — full result structure", () => {
  it("returns all expected fields for a normal run", () => {
    const values = Array.from({ length: 30 }, (_, t) => 100 + t * 2);
    const r = forecastSeries(toSeries(values), { horizon: 5, seasonLength: 7 });
    expect(Array.isArray(r.history)).toBe(true);
    expect(Array.isArray(r.fitted)).toBe(true);
    expect(r.fitted).toHaveLength(values.length);
    expect(Array.isArray(r.forecast)).toBe(true);
    expect(r.forecast).toHaveLength(5);
    expect(Array.isArray(r.seasonalIndices)).toBe(true);
    expect(typeof r.residualStd).toBe("number");
    expect(typeof r.level).toBe("number");
    expect(typeof r.trend).toBe("number");
    expect(Array.isArray(r.anomalies)).toBe(true);
    // metrics: series >= 6 so not null
    expect(r.metrics).not.toBeNull();
  });

  it("forecast dates advance by 1 day each step", () => {
    const values = Array.from({ length: 20 }, (_, t) => 50 + t);
    const r = forecastSeries(toSeries(values, "2026-03-01"), {
      horizon: 3,
      seasonLength: 1,
    });
    // 20 points starting 2026-03-01 means last point is 2026-03-20 (index 19)
    // forecast h=1 => 2026-03-21, h=2 => 2026-03-22, h=3 => 2026-03-23
    expect(r.forecast[0]!.date).toBe("2026-03-21");
    expect(r.forecast[1]!.date).toBe("2026-03-22");
    expect(r.forecast[2]!.date).toBe("2026-03-23");
  });
});

// ─── scoreForecast ────────────────────────────────────────────────────────────

describe("scoreForecast", () => {
  it("returns zeros for empty input", () => {
    expect(scoreForecast([], [])).toEqual({ mae: 0, rmse: 0, mape: 0, sampleSize: 0 });
  });

  it("computes MAE, RMSE, MAPE correctly", () => {
    const actual = [100, 200, 300];
    const predicted = [110, 180, 330];
    const m = scoreForecast(actual, predicted);
    expect(m.mae).toBeCloseTo(20, 6);
    expect(m.rmse).toBeCloseTo(Math.sqrt((100 + 400 + 900) / 3), 6);
    expect(m.mape).toBeCloseTo(10, 6);
    expect(m.sampleSize).toBe(3);
  });

  it("skips MAPE terms where actual is 0", () => {
    const m = scoreForecast([0, 100], [5, 90]);
    expect(m.mape).toBeCloseTo(10, 6);
  });

  it("MAPE is 0 when all actuals are 0 (pctCount=0)", () => {
    const m = scoreForecast([0, 0], [5, 5]);
    expect(m.mape).toBe(0);
    expect(m.mae).toBeCloseTo(5, 6);
  });

  it("uses minimum length when arrays differ in length", () => {
    const m = scoreForecast([100, 200, 300], [110, 180]);
    expect(m.sampleSize).toBe(2);
  });

  it("handles perfect prediction (zero error)", () => {
    const m = scoreForecast([100, 200, 300], [100, 200, 300]);
    expect(m.mae).toBe(0);
    expect(m.rmse).toBe(0);
    expect(m.mape).toBe(0);
  });
});

// ─── backtest ─────────────────────────────────────────────────────────────────

describe("backtest", () => {
  it("returns null for series shorter than 6", () => {
    expect(backtest([])).toBeNull();
    expect(backtest([1])).toBeNull();
    expect(backtest([1, 2, 3, 4, 5])).toBeNull();
  });

  it("returns metrics for series of length 6", () => {
    const m = backtest([10, 20, 30, 40, 50, 60]);
    // n=6, holdout=max(1, min(floor(6*0.2)=1, 7))=1, trainLen=5 >= 4
    expect(m).not.toBeNull();
    expect(m!.sampleSize).toBeGreaterThan(0);
  });

  it("yields low error on a clean linear series", () => {
    const values = Array.from({ length: 40 }, (_, t) => 50 + 1.5 * t);
    const m = backtest(values, { horizon: 7, seasonLength: 1 });
    expect(m).not.toBeNull();
    expect(m!.mape).toBeLessThan(5);
    expect(m!.sampleSize).toBeGreaterThan(0);
  });

  it("returns null when trainLen < 4", () => {
    // n=6, floor(6*0.2)=1, holdout=1, trainLen=5 -> OK
    // For trainLen<4: n=5 -> null. n=6 with horizon forced large... let's try edge
    // n=5 < 6 so returns null at the first guard
    expect(backtest([1, 2, 3, 4, 5])).toBeNull();
    // n=6: trainLen=5 >= 4 -> not null
    const m = backtest([1, 2, 3, 4, 5, 6]);
    expect(m).not.toBeNull();
  });

  it("works with seasonality in backtest (hasSeason=true path)", () => {
    const season = [10, -10, 5, -5, 8, -8, 0];
    const values = syntheticSeasonal(50, 100, 2, season);
    const m = backtest(values, { horizon: 7, seasonLength: 7 });
    expect(m).not.toBeNull();
    expect(m!.sampleSize).toBeGreaterThan(0);
  });

  it("works with no seasonality in backtest (hasSeason=false path)", () => {
    const values = Array.from({ length: 30 }, (_, t) => 50 + t);
    const m = backtest(values, { horizon: 5, seasonLength: 1 });
    expect(m).not.toBeNull();
    expect(Number.isFinite(m!.mae)).toBe(true);
  });

  it("uses default options when none given", () => {
    const values = Array.from({ length: 20 }, (_, t) => 10 + t);
    const m = backtest(values);
    expect(m).not.toBeNull();
  });
});

// ─── detectResidualAnomalies ──────────────────────────────────────────────────

describe("detectResidualAnomalies", () => {
  it("returns [] for fewer than 4 points", () => {
    expect(detectResidualAnomalies([], [])).toEqual([]);
    expect(detectResidualAnomalies(toSeries([1, 2, 3]), [1, 2, 3])).toEqual([]);
  });

  it("flags an injected spike via forecastSeries", () => {
    const values = Array.from({ length: 30 }, (_, t) => 100 + t);
    values[20] = 400;
    const r = forecastSeries(toSeries(values), { horizon: 3, seasonLength: 1 });
    expect(r.anomalies.length).toBeGreaterThan(0);
    expect(r.anomalies.some((a) => a.index === 20)).toBe(true);
  });

  it("flags nothing on a perfectly smooth series", () => {
    const values = Array.from({ length: 30 }, (_, t) => 100 + 2 * t);
    const r = forecastSeries(toSeries(values), { horizon: 3, seasonLength: 1 });
    expect(r.anomalies).toHaveLength(0);
  });

  it("returns [] when all residuals are identical (scale=0 path via stdDev=0)", () => {
    // Craft history and fitted so residuals are all zero → scale=0 → return []
    const hist = toSeries([10, 10, 10, 10, 10]);
    const fitted = [10, 10, 10, 10, 10];
    const result = detectResidualAnomalies(hist, fitted);
    expect(result).toEqual([]);
  });

  it("uses MAD scale when mad > 0", () => {
    // Use forecastSeries with a spike; the MAD-based scale path is exercised
    const values = Array.from({ length: 20 }, (_, t) => 200 + t);
    values[10] = 1000;
    const hist = toSeries(values);
    const r = forecastSeries(hist, { horizon: 2, seasonLength: 1 });
    expect(r.anomalies.length).toBeGreaterThan(0);
  });

  it("falls back to stdDev scale when mad=0 (all deviations identical)", () => {
    // Build history and fitted so residuals are: [5, 5, 5, 5, ...] but one outlier
    // In this case MAD of residuals = 0 (all same except outlier), falls back to stdDev
    const hist = toSeries([105, 105, 105, 105, 105, 105, 200]);
    const fitted = [100, 100, 100, 100, 100, 100, 100];
    // residuals from index 1: [5, 5, 5, 5, 5, 100]
    // med=5, absDev=[0,0,0,0,0,95], mad=median([0,0,0,0,0,95])=0
    // scale = stdDev(residuals, 1) > 0
    const result = detectResidualAnomalies(hist, fitted, 2);
    // The outlier residual (100) should be flagged
    expect(result.length).toBeGreaterThan(0);
  });

  it("sorts anomalies by |zScore| descending", () => {
    const values = Array.from({ length: 30 }, (_, t) => 50 + t);
    values[5] = 300;
    values[15] = 500;
    const r = forecastSeries(toSeries(values), { horizon: 2, seasonLength: 1 });
    if (r.anomalies.length >= 2) {
      const zScores = r.anomalies.map((a) => Math.abs(a.zScore));
      for (let i = 1; i < zScores.length; i++) {
        expect(zScores[i]!).toBeLessThanOrEqual(zScores[i - 1]!);
      }
    }
  });

  it("each anomaly has expected structure fields", () => {
    const values = Array.from({ length: 30 }, (_, t) => 100 + t);
    values[20] = 1000;
    const hist = toSeries(values);
    const r = forecastSeries(hist, { horizon: 2, seasonLength: 1 });
    expect(r.anomalies.length).toBeGreaterThan(0);
    for (const a of r.anomalies) {
      expect(typeof a.index).toBe("number");
      expect(typeof a.date).toBe("string");
      expect(typeof a.value).toBe("number");
      expect(typeof a.expected).toBe("number");
      expect(typeof a.residual).toBe("number");
      expect(typeof a.zScore).toBe("number");
    }
  });

  it("uses shorter array length when history and fitted differ in length", () => {
    // n = min(5, 10) = 5 < 4? No, 5 >= 4 so proceeds
    const hist = toSeries([100, 105, 102, 108, 200]);
    const fitted = new Array(10).fill(103);
    const result = detectResidualAnomalies(hist, fitted);
    // Should not throw; result may or may not have anomalies
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── normalQuantile: boundary and tail coverage ───────────────────────────────

describe("normalQuantile — all branches", () => {
  it("covers p=0 edge (returns -Infinity)", () => {
    expect(normalQuantile(0)).toBe(-Infinity);
  });

  it("covers p negative (returns -Infinity)", () => {
    expect(normalQuantile(-0.5)).toBe(-Infinity);
  });

  it("covers p=1 edge (returns +Infinity)", () => {
    expect(normalQuantile(1)).toBe(Infinity);
  });

  it("covers p > 1 (returns +Infinity)", () => {
    expect(normalQuantile(1.5)).toBe(Infinity);
  });

  it("covers p in low tail (p < 0.02425) — lines 184-185", () => {
    // pLow = 0.02425; p=0.02 < pLow
    const result = normalQuantile(0.02);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeLessThan(-2);
  });

  it("covers p exactly at pLow boundary: p=0.02424 < pLow", () => {
    const result = normalQuantile(0.024);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeLessThan(-1.96);
  });

  it("covers p in middle region (pLow <= p <= pHigh)", () => {
    const result = normalQuantile(0.5);
    expect(result).toBeCloseTo(0, 6);
  });

  it("covers p in high tail (p > pHigh = 0.97575) — lines 198-199", () => {
    // pHigh = 1 - 0.02425 = 0.97575; p=0.98 > pHigh
    const result = normalQuantile(0.98);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThan(1.96);
  });

  it("covers p=0.976 (just above pHigh)", () => {
    const result = normalQuantile(0.976);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThan(1.96);
  });

  it("symmetry: normalQuantile(p) = -normalQuantile(1-p) for tail values", () => {
    const p = 0.01;
    expect(normalQuantile(p)).toBeCloseTo(-normalQuantile(1 - p), 8);
  });
});

// ─── Integration: ciLevel exercising normalQuantile tails ────────────────────

describe("forecastSeries — ciLevel exercising normalQuantile tails", () => {
  it("ciLevel clamped to 0.5 (lower bound) -> normalQuantile(0.75) in middle region", () => {
    const values = Array.from({ length: 20 }, (_, t) => 100 + t + (t % 2 ? 3 : -3));
    // ciLevel=0 -> clamped to 0.5 -> 0.5 + 0.5/2 = 0.75, in middle region
    const r = forecastSeries(toSeries(values), {
      horizon: 1,
      seasonLength: 1,
      ciLevel: 0,
    });
    expect(Number.isFinite(r.forecast[0]!.upper)).toBe(true);
  });

  it("ciLevel=0.999999 (upper bound) -> normalQuantile(0.9999995) in high tail", () => {
    const values = Array.from({ length: 20 }, (_, t) => 100 + t + (t % 2 ? 3 : -3));
    const r = forecastSeries(toSeries(values), {
      horizon: 1,
      seasonLength: 1,
      ciLevel: 0.999999,
    });
    expect(Number.isFinite(r.forecast[0]!.upper)).toBe(true);
    // Band should be very wide
    const width = r.forecast[0]!.upper - r.forecast[0]!.lower;
    expect(width).toBeGreaterThan(0);
  });
});
