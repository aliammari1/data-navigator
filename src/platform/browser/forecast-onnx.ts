/**
 * Forecasting — pure JS (Holt-Winters + simple-statistics linear regression).
 *
 * Picks the best method based on data length:
 * - >= 6 rows: Holt-Winters double exponential smoothing (captures trend)
 * - < 6 rows: linear regression fallback
 */

"use client";

import { linearRegression, linearRegressionLine } from "simple-statistics";

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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function linearForecast(hourly: HourlyRow[], horizon: number): ForecastPoint[] {
  const rows = hourly.slice(-24);
  const n = rows.length;

  if (n < 3) return [];

  const totalPoints = rows.map((row, index) => {
    return [index, row.total] as [number, number];
  });

  const successRatePoints = rows.map((row, index) => {
    const successRate = row.total > 0 ? row.success / row.total : 0;
    return [index, successRate] as [number, number];
  });

  const totalRegression = linearRegression(totalPoints);
  const successRateRegression = linearRegression(successRatePoints);

  const totalLine = linearRegressionLine(totalRegression);
  const successRateLine = linearRegressionLine(successRateRegression);

  const lastHour = rows.at(-1)?.hour ?? 0;

  return Array.from({ length: horizon }, (_, index) => {
    const predictedIndex = n + index;

    return {
      hour: (lastHour + index + 1) % 24,
      predictedTotal: Math.max(0, Math.round(totalLine(predictedIndex))),
      predictedSuccessRate: clamp(successRateLine(predictedIndex), 0, 1),
      isForecast: true,
    };
  });
}

function holtWintersForecast(
  values: number[],
  horizon: number,
  alpha = 0.3,
  beta = 0.1,
): number[] {
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

function holtWintersForecastPoints(
  hourly: HourlyRow[],
  horizon: number,
): ForecastPoint[] {
  const rows = hourly.slice(-24);
  const n = rows.length;

  if (n < 6) return linearForecast(hourly, horizon);

  const totals = rows.map((r) => r.total);
  const rates = rows.map((r) => (r.total > 0 ? r.success / r.total : 0));
  const lastHour = rows.at(-1)?.hour ?? 0;

  const predictedTotals = holtWintersForecast(totals, horizon);
  const predictedRates = holtWintersForecast(rates, horizon);

  return Array.from({ length: horizon }, (_, i) => ({
    hour: (lastHour + i + 1) % 24,
    predictedTotal: Math.max(0, Math.round(predictedTotals[i] ?? 0)),
    predictedSuccessRate: clamp(predictedRates[i] ?? 0, 0, 1),
    isForecast: true,
  }));
}

export async function forecastNextHours(
  hourly: HourlyRow[],
  horizon = 4,
): Promise<ForecastPoint[]> {
  if (hourly.length < 3) return [];

  const rows = hourly.slice(-24);

  if (rows.length >= 6) {
    return holtWintersForecastPoints(hourly, horizon);
  }

  return linearForecast(hourly, horizon);
}
