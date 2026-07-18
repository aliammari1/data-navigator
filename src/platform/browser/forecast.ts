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
