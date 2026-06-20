/**
 * Demo / fallback report data — used ONLY when no DuckDB dataset is reachable
 * (browser demo, or no datasets imported yet). Real reports come from
 * `aggregateReportData` over a registered dataset.
 *
 * The hourly series is built with a SEEDED RNG (`mulberry32`, default seed 42)
 * — deterministic and reproducible, never `Math.random()`. This keeps the demo
 * fallback honest about the project's "no fabricated module-load data" rule:
 * the same fallback renders the same numbers every load.
 */

import { DEFAULT_SEED, mulberry32 } from "@/platform/viz";
import type { ReportData } from "./types";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Build the demo hourly series deterministically (seeded). */
function buildHourly(seed: number): ReportData["hourlyData"] {
  const rand = mulberry32(seed);
  return Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    count: Math.round(2000 + Math.sin((h - 10) * 0.4) * 1500 + rand() * 500),
    successRate: 93 + rand() * 5,
  }));
}

/** Deterministic demo dataset; identical on every load. */
export function buildSampleData(date: string = todayKey()): ReportData {
  return {
    date,
    totalTransactions: 142_847,
    successRate: 96.4,
    totalRevenue: 2_845_912.75,
    failedTransactions: 5_124,
    companyName: "Telecom Analytics",
    topChannels: [
      { name: "Bill Payment", volume: 38_420, successRate: 98.2, revenue: 892_450.5 },
      { name: "Voice Mobile TTCash", volume: 27_180, successRate: 95.7, revenue: 445_200.25 },
      { name: "Data Sabba", volume: 22_340, successRate: 97.1, revenue: 312_890.125 },
      { name: "Credit Transfer", volume: 18_900, successRate: 94.3, revenue: 287_640.0 },
      { name: "Voice Fixed TTCash", volume: 14_230, successRate: 96.8, revenue: 245_120.75 },
      { name: "Data eVoucher", volume: 11_480, successRate: 92.4, revenue: 198_340.5 },
      { name: "Voucher Payment", volume: 8_940, successRate: 89.1, revenue: 145_680.25 },
      { name: "Voice Mobile Voucher", volume: 7_357, successRate: 78.5, revenue: 98_590.375 },
    ],
    hourlyData: buildHourly(DEFAULT_SEED),
  };
}

/** Stable singleton demo dataset (today's date). */
export const SAMPLE_DATA: ReportData = buildSampleData();
