/**
 * Hourly Forecasting — Holt-Winters double exponential smoothing.
 * Runs entirely in-browser, no API key, no data leaves the device.
 */

"use client";

export interface HourlyRow {
  hour: number;
  total: number;
  success: number;
  declined: number;
  amount: number;
}

export interface ForecastPoint {
  hour: number;
  predictedTotal: number;
  predictedSuccessRate: number;
  isForecast: true;
}

function holtWinters(values: number[], horizon: number, alpha = 0.3, beta = 0.1): number[] {
  const n = values.length;
  if (n === 0) return [];

  let level = values[0];
  let trend = n > 1 ? values[1] - values[0] : 0;

  for (let i = 1; i < n; i++) {
    const prevLevel = level;
    level = alpha * values[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }

  return Array.from({ length: horizon }, (_, i) => level + trend * (i + 1));
}

export async function forecastNextHours(
  hourly: HourlyRow[],
  horizon = 4,
): Promise<ForecastPoint[]> {
  if (hourly.length < 6) return [];

  const rows = hourly.slice(-24);
  const totals = rows.map((r) => r.total);
  const rates = rows.map((r) => (r.total > 0 ? r.success / r.total : 0));
  const lastHour = rows.at(-1)!.hour;

  const predictedTotals = holtWinters(totals, horizon);
  const predictedRates = holtWinters(rates, horizon);

  return Array.from({ length: horizon }, (_, i) => ({
    hour: (lastHour + i + 1) % 24,
    predictedTotal: Math.max(0, Math.round(predictedTotals[i] ?? 0)),
    predictedSuccessRate: Math.max(0, Math.min(1, predictedRates[i] ?? 0)),
    isForecast: true,
  }));
}
