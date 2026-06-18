import { bench, describe } from "vitest";
import {
  computeAIInsights,
  computeCanalRiskScore,
  detectHourlyAnomalies,
  generateNarrative,
  linearRegression,
} from "@/features/telecom/lib/insights";
import type {
  CanalKey,
  CanalSummary,
  HourlyRow,
  KPISummary,
  StatusRow,
} from "@/features/telecom/types";

/**
 * Performance benchmarks for the telecom report-computation analytics
 * (run with `pnpm run bench`).
 *
 * Hot path: once DuckDB returns the aggregated KPI / canal / hourly / status
 * summaries for a daily report, the renderer derives every flagship analytic
 * purely in JS — z-score hourly anomaly detection, per-canal composite risk
 * scoring, the daily-trend linear regression, the executive narrative, and the
 * full AI-insights engine. These run synchronously on the render thread each
 * time a report is opened or filtered, so a throughput regression here is
 * directly user-visible.
 *
 * `linearRegression` is the true large-array hot path: it fits the daily-trend
 * point series, which scales with the number of transactions/periods plotted,
 * so it is benched over 10k and 100k synthetic points. The summary-consuming
 * engines (`computeAIInsights`, `generateNarrative`, `computeCanalRiskScore`)
 * are benched over realistic and stress-sized canal / status fan-outs.
 *
 * All synthetic input is built ONCE at module scope with a deterministic,
 * counter-based generator (NO Math.random / Date.now). Each bench callback only
 * exercises the function under test, never data generation.
 */

// ─── Deterministic generators (counter-based, index-varied) ─────────────────

const CANAL_KEYS: CanalKey[] = [
  "bill_payment",
  "voice_fixed_ttcash",
  "voice_fixed_voucher",
  "voice_mobile_ttcash",
  "voice_mobile_voucher",
  "data_sabba",
  "data_evoucher",
  "voucher_for_payment",
  "credit_transfer",
  "voucher_convergent",
];

const STATUS_LABELS = [
  "SUCCESS",
  "DECLINED",
  "REFUND",
  "INSTANCE",
  "SUBMITTED",
  "OTHER",
];

/** Bounded pseudo-random in [0, mod) derived from a counter (no Math.random). */
function counterMod(i: number, mod: number): number {
  // Two coprime strides mix low/high bits so successive indices don't cluster.
  return ((i * 2654435761 + 40503) >>> 0) % mod;
}

/** Build a deterministic (x, y) point series for linear-regression fitting. */
function buildTrendPoints(n: number): Array<[number, number]> {
  const out: Array<[number, number]> = new Array(n);
  for (let i = 0; i < n; i++) {
    // y = 1.7x + 12 + bounded periodic noise — a real upward trend with jitter.
    const noise = (counterMod(i, 200) - 100) * 0.5;
    out[i] = [i, 1.7 * i + 12 + noise];
  }
  return out;
}

/** Build a 24-hour distribution with a deterministic daytime peak + jitter. */
function buildHourly(hours: number): HourlyRow[] {
  const out: HourlyRow[] = new Array(hours);
  for (let h = 0; h < hours; h++) {
    const hourOfDay = h % 24;
    // Daytime hours carry more traffic; one hour holds a pronounced peak.
    const base = 200 + counterMod(h, 150);
    const daytime = hourOfDay >= 8 && hourOfDay <= 20 ? 600 : 0;
    const peak = hourOfDay === 14 ? 2500 : 0;
    const total = base + daytime + peak;
    const declined = Math.floor(total * 0.06) + counterMod(h, 5);
    const success = total - declined;
    out[h] = { hour: hourOfDay, total, success, declined, amount: total * 7 };
  }
  return out;
}

function buildCanals(n: number): CanalSummary[] {
  const out: CanalSummary[] = new Array(n);
  let grandTotal = 0;
  // First pass: totals so `share` can be a real fraction of the whole.
  const totals: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    totals[i] = 500 + counterMod(i, 9500);
    grandTotal += totals[i];
  }
  for (let i = 0; i < n; i++) {
    const total = totals[i];
    // Success rate varies 60–100% deterministically; a few canals run hot.
    const successRate = 60 + counterMod(i, 41);
    const success = Math.floor((total * successRate) / 100);
    const declined = Math.floor((total - success) * 0.7);
    const refund = Math.floor((total - success - declined) * 0.4);
    const instance = total - success - declined - refund;
    const amount = total * (3 + counterMod(i, 12));
    out[i] = {
      key: CANAL_KEYS[i % CANAL_KEYS.length],
      label: `Canal ${i}`,
      icon: (() => null) as unknown as CanalSummary["icon"],
      color: "",
      bgColor: "",
      borderColor: "",
      total,
      success,
      declined,
      refund,
      instance,
      submitted: 0,
      amount,
      successRate,
      avgAmount: amount / Math.max(total, 1),
      share: (total / grandTotal) * 100,
    };
  }
  return out;
}

function buildStatusRows(n: number): StatusRow[] {
  const out: StatusRow[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const count = 1000 + counterMod(i, 50000);
    out[i] = {
      status: STATUS_LABELS[i % STATUS_LABELS.length],
      count,
      amount: count * 6,
    };
  }
  return out;
}

function buildKPI(totalTransactions: number): KPISummary {
  const successCount = Math.floor(totalTransactions * 0.72);
  const declinedCount = Math.floor(totalTransactions * 0.18);
  const refundCount = Math.floor(totalTransactions * 0.04);
  const instanceCount = Math.floor(totalTransactions * 0.05);
  const submittedCount =
    totalTransactions - successCount - declinedCount - refundCount - instanceCount;
  return {
    totalTransactions,
    successCount,
    declinedCount,
    refundCount,
    instanceCount,
    submittedCount,
    successRate: (successCount / Math.max(totalTransactions, 1)) * 100,
    totalAmount: totalTransactions * 8.5,
    avgAmount: 8.5,
    avgProcessingMs: 120,
    uniqueCustomers: Math.floor(totalTransactions * 0.4),
    peakHour: 14,
    topErrorCode: "DCL",
  };
}

// ─── Pre-built deterministic input (module scope) ───────────────────────────

const TREND_10K = buildTrendPoints(10_000);
const TREND_100K = buildTrendPoints(100_000);

// Hourly anomaly detection scans a per-row series; a realistic daily report is
// 24 rows, while a multi-day series can grow large — bench both.
const HOURLY_24 = buildHourly(24);
const HOURLY_10K = buildHourly(10_000);
const HOURLY_100K = buildHourly(100_000);

// Realistic flagship report = 10 canals; the stress fan-out exercises the
// per-canal reduce/sort/scan loops inside the engines.
const CANALS_10 = buildCanals(10);
const CANALS_10K = buildCanals(10_000);

const STATUS_10K = buildStatusRows(10_000);
const STATUS_REALISTIC = buildStatusRows(6);

const KPI_REALISTIC = buildKPI(120_000);

// ─── Benchmarks ─────────────────────────────────────────────────────────────

describe("linearRegression (daily-trend fit — large array hot path)", () => {
  bench("linearRegression over 10k points", () => {
    linearRegression(TREND_10K);
  });
  bench("linearRegression over 100k points", () => {
    linearRegression(TREND_100K);
  });
});

describe("detectHourlyAnomalies (z-score scan over hourly series)", () => {
  bench("detectHourlyAnomalies over 24 hourly rows (realistic)", () => {
    detectHourlyAnomalies(HOURLY_24);
  });
  bench("detectHourlyAnomalies over 10k hourly rows", () => {
    detectHourlyAnomalies(HOURLY_10K);
  });
  bench("detectHourlyAnomalies over 100k hourly rows", () => {
    detectHourlyAnomalies(HOURLY_100K);
  });
});

describe("computeCanalRiskScore (per-canal composite score)", () => {
  bench("computeCanalRiskScore over 10 canals (realistic)", () => {
    for (const c of CANALS_10) computeCanalRiskScore(c);
  });
  bench("computeCanalRiskScore over 10k canals", () => {
    for (const c of CANALS_10K) computeCanalRiskScore(c);
  });
});

describe("computeAIInsights (full report insights engine)", () => {
  bench("computeAIInsights realistic report (10 canals / 24h / 6 status)", () => {
    computeAIInsights(KPI_REALISTIC, CANALS_10, HOURLY_24, STATUS_REALISTIC);
  });
  bench("computeAIInsights stress (10k canals / 100k hourly / 10k status)", () => {
    computeAIInsights(KPI_REALISTIC, CANALS_10K, HOURLY_100K, STATUS_10K);
  });
});

describe("generateNarrative (executive narrative builder)", () => {
  bench("generateNarrative realistic (10 canals / 24h)", () => {
    generateNarrative(KPI_REALISTIC, CANALS_10, HOURLY_24, "2026-06-16");
  });
  bench("generateNarrative stress (10k canals / 100k hourly)", () => {
    generateNarrative(KPI_REALISTIC, CANALS_10K, HOURLY_100K, "2026-06-16");
  });
});
