/**
 * Forecasting — pure JS (Holt-Winters + simple-statistics linear regression).
 *
 * Picks the best method based on data length:
 * - >= 6 rows: Holt-Winters double exponential smoothing (captures trend)
 * - < 6 rows: linear regression fallback
 */

"use client";
export interface HourlyRow {
  hour: number;
  total: number;
  success: number;
  declined: number;
  amount: number;
}
