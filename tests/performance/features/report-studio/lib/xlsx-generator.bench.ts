import { bench, describe } from "vitest";
import { buildXlsx } from "@/features/report-studio/lib/xlsx-generator";
import type { ReportAnomaly, ReportChannel, ReportData, ReportHourly } from "@/features/report-studio/lib/types";

/**
 * Performance benchmarks for the report-studio XLSX export path
 * (run with `pnpm run bench`).
 *
 * Hot path: `buildXlsx` runs on every "Export XLSX" click from the export
 * worker, building a multi-sheet workbook and serializing it via exceljs's
 * in-memory `writeBuffer`. Repo history notes this call is "heavy" enough that
 * it once triggered an intermittent full-suite crash — this bench exists
 * specifically to catch a throughput/memory regression in that call before it
 * resurfaces, at both a typical single-day report size and a stress size (a
 * multi-day / long-retention export with a large channel and hourly fan-out).
 *
 * All synthetic input is built ONCE at module scope with a deterministic,
 * counter-based generator (NO Math.random / Date.now — `date` fields are
 * fixed strings, never `new Date()`). Each bench callback only exercises
 * `buildXlsx`, never fixture construction.
 */

// ─── Deterministic generators (counter-based, index-varied) ─────────────────

/** Bounded pseudo-random in [0, mod) derived from a counter (no Math.random). */
function counterMod(i: number, mod: number): number {
  return ((i * 2654435761 + 40503) >>> 0) % mod;
}

function buildChannels(n: number): ReportChannel[] {
  return Array.from({ length: n }, (_, i) => ({
    name: `Channel ${i}`,
    volume: 500 + counterMod(i, 50_000),
    successRate: 60 + counterMod(i, 41),
    revenue: 1000 + counterMod(i, 900_000) / 3,
  }));
}

function buildHourly(hours: number): ReportHourly[] {
  return Array.from({ length: hours }, (_, i) => ({
    hour: i % 24,
    count: 200 + counterMod(i, 5_000),
    successRate: 70 + counterMod(i, 30),
  }));
}

function buildAnomalies(n: number): ReportAnomaly[] {
  return Array.from({ length: n }, (_, i) => ({
    hour: i % 24,
    count: 2_000 + counterMod(i, 3_000),
    successRate: 40 + counterMod(i, 20),
    score: 3 + counterMod(i, 500) / 100,
  }));
}

function buildReport(channelCount: number, hourlyCount: number, anomalyCount: number): ReportData {
  return {
    date: "2026-06-16",
    totalTransactions: 120_000,
    successRate: 92.4,
    totalRevenue: 845_320.5,
    failedTransactions: 9_120,
    topChannels: buildChannels(channelCount),
    hourlyData: buildHourly(hourlyCount),
    anomalies: buildAnomalies(anomalyCount),
    companyName: "Telecom Analytics",
  };
}

// ─── Pre-built deterministic input (module scope) ───────────────────────────

// Realistic: one daily report — ~10 canals, 24 hourly rows, a handful of anomalies.
const REPORT_REALISTIC = buildReport(10, 24, 4);
// Stress: a long-retention / multi-day export — large channel fan-out and a
// month of hourly rows (24 * 30).
const REPORT_STRESS = buildReport(500, 720, 50);

// ─── Benchmarks ─────────────────────────────────────────────────────────────

describe("buildXlsx (multi-sheet workbook build + exceljs writeBuffer)", () => {
  bench("buildXlsx — realistic daily report (10 canals / 24h / 4 anomalies)", async () => {
    await buildXlsx(REPORT_REALISTIC);
  });

  bench("buildXlsx — stress export (500 canals / 720h / 50 anomalies)", async () => {
    await buildXlsx(REPORT_STRESS);
  });
});
