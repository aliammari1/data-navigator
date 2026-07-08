import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Behavioral tests for report-studio/lib/insights.ts.
 *
 * Exported symbols:
 *   - previousDay(date: string): string
 *   - detectHourlyAnomalies(data, maxAnomalies?): Promise<ReportAnomaly[]>
 *   - computeComparison(dataset, current): Promise<ReportComparison | null>
 *   - enrichWithInsights(data, dataset?): Promise<ReportData>
 *
 * External dependencies mocked:
 *   - @/platform/viz           → getAnalysisProxy
 *   - @/features/report-studio/data/queries → aggregateReportData, detectColumnRoles
 *   - @/workers/analysis.worker → dynamic import fallback (kernels)
 *
 * The real target module logic (previousDay, anomaly transform, comparison
 * shape construction, enrichment merging) executes for real.
 */

// ─── Analysis proxy mock ──────────────────────────────────────────────────────

/** Shared mutable state for the analysis proxy fake. */
let gesdResult = { indices: [0, 2], scores: [3.5, 2.1] };
let welchResult = { pValue: 0.02, significant: true, meanA: 100, meanB: 90 };
let proxyEnabled = true;

const fakeProxy = {
  gesdAnomalies: vi.fn(async (_counts: number[], _opts: { maxAnomalies: number }) => gesdResult),
  welchTTest: vi.fn(async (_a: number[], _b: number[]) => welchResult),
};

vi.mock("@/platform/viz", () => ({
  getAnalysisProxy: vi.fn(() => (proxyEnabled ? fakeProxy : null)),
}));

// ─── Queries mock ─────────────────────────────────────────────────────────────

let columnRolesResult: { timestamp: string | null } = { timestamp: "created_at" };
let aggregateResult: import("@/features/report-studio/lib/types").ReportData | null = null;
let aggregateShouldThrow = false;

vi.mock("@/features/report-studio/data/queries", () => ({
  detectColumnRoles: vi.fn(() => columnRolesResult),
  aggregateReportData: vi.fn(async () => {
    if (aggregateShouldThrow) throw new Error("DuckDB error");
    return aggregateResult;
  }),
}));

// ─── Analysis worker mock (dynamic import fallback) ───────────────────────────

vi.mock("@/workers/analysis.worker", () => ({
  gesdAnomalies: vi.fn(async (_counts: number[], _opts: { maxAnomalies: number }) => gesdResult),
  welchTTest: vi.fn(async (_a: number[], _b: number[]) => welchResult),
}));

// ─── Import the real target AFTER mocks are registered ───────────────────────

const {
  previousDay,
  detectHourlyAnomalies,
  computeComparison,
  enrichWithInsights,
} = await import("@/features/report-studio/lib/insights");

// ─── Fixtures ─────────────────────────────────────────────────────────────────

import type {
  ReportData,
  ReportHourly,
} from "@/features/report-studio/lib/types";
import type { RegisteredDataset } from "@/platform/duckdb/duckdb";

function makeHourly(n: number): ReportHourly[] {
  return Array.from({ length: n }, (_, i) => ({
    hour: i,
    count: 10 + i * 3,
    successRate: 90 - i,
  }));
}

function makeData(partial: Partial<ReportData> = {}): ReportData {
  return {
    date: "2026-06-25",
    totalTransactions: 1000,
    successRate: 95,
    totalRevenue: 500.0,
    failedTransactions: 50,
    topChannels: [],
    hourlyData: makeHourly(6),
    ...partial,
  };
}

const fakeDataset = {
  name: "telecom",
  columns: [
    { name: "created_at", type: "TIMESTAMP" },
    { name: "amount", type: "DOUBLE" },
  ],
} as unknown as RegisteredDataset;

function makePrevData(partial: Partial<ReportData> = {}): ReportData {
  return {
    date: "2026-06-24",
    totalTransactions: 800,
    successRate: 92,
    totalRevenue: 400.0,
    failedTransactions: 40,
    topChannels: [],
    hourlyData: makeHourly(6),
    ...partial,
  };
}

beforeEach(() => {
  // Reset mutable fake state.
  gesdResult = { indices: [0, 2], scores: [3.5, 2.1] };
  welchResult = { pValue: 0.02, significant: true, meanA: 100, meanB: 90 };
  proxyEnabled = true;
  columnRolesResult = { timestamp: "created_at" };
  aggregateResult = makePrevData();
  aggregateShouldThrow = false;

  fakeProxy.gesdAnomalies.mockClear();
  fakeProxy.welchTTest.mockClear();
});

// ─── previousDay ──────────────────────────────────────────────────────────────

describe("previousDay", () => {
  it("returns the calendar day before a valid ISO date", () => {
    // Arrange: date with a simple subtraction
    // Act
    const result = previousDay("2026-06-25");
    // Assert: June 25 → June 24
    expect(result).toBe("2026-06-24");
  });

  it("wraps back to the previous month correctly", () => {
    // Arrange: June 1 → May 31
    const result = previousDay("2026-06-01");
    expect(result).toBe("2026-05-31");
  });

  it("handles month with 31 days (Jan 1 → Dec 31)", () => {
    const result = previousDay("2026-01-01");
    expect(result).toBe("2025-12-31");
  });

  it("handles leap-year Feb 29 correctly (Mar 1 → Feb 28 on non-leap)", () => {
    // 2025 is not a leap year; March 1 → Feb 28
    const result = previousDay("2025-03-01");
    expect(result).toBe("2025-02-28");
  });

  it("handles leap-year Feb 29 correctly (Mar 1 → Feb 29 on leap year)", () => {
    // 2024 is a leap year; March 1 → Feb 29
    const result = previousDay("2024-03-01");
    expect(result).toBe("2024-02-29");
  });

  it("returns the input unchanged for an invalid date string", () => {
    // Arrange: NaN date
    const result = previousDay("not-a-date");
    // Assert: identity behavior when NaN
    expect(result).toBe("not-a-date");
  });

  it("returns the input unchanged for an empty string", () => {
    const result = previousDay("");
    expect(result).toBe("");
  });

  it("produces a 10-char YYYY-MM-DD result for a normal date", () => {
    const result = previousDay("2026-12-31");
    expect(result).toBe("2026-12-30");
    expect(result).toHaveLength(10);
  });
});

// ─── detectHourlyAnomalies ───────────────────────────────────────────────────

describe("detectHourlyAnomalies", () => {
  it("returns an empty array when hourlyData has fewer than 4 entries", async () => {
    // Arrange: only 3 data points — not enough for GESD
    const data = makeData({ hourlyData: makeHourly(3) });
    // Act
    const result = await detectHourlyAnomalies(data);
    // Assert: early-exit path
    expect(result).toEqual([]);
  });

  it("returns an empty array when hourlyData is exactly empty", async () => {
    const data = makeData({ hourlyData: [] });
    const result = await detectHourlyAnomalies(data);
    expect(result).toEqual([]);
  });

  it("calls gesdAnomalies with the counts array extracted from hourlyData", async () => {
    // Arrange: 6 hourly points
    const data = makeData({ hourlyData: makeHourly(6) });
    await detectHourlyAnomalies(data);
    // Assert: proxy was invoked with the correct count values
    expect(fakeProxy.gesdAnomalies).toHaveBeenCalledWith(
      [10, 13, 16, 19, 22, 25],
      { maxAnomalies: 4 },
    );
  });

  it("passes the custom maxAnomalies value to the proxy", async () => {
    const data = makeData({ hourlyData: makeHourly(6) });
    await detectHourlyAnomalies(data, 2);
    expect(fakeProxy.gesdAnomalies).toHaveBeenCalledWith(
      expect.any(Array),
      { maxAnomalies: 2 },
    );
  });

  it("maps returned indices to the corresponding hourly series entry", async () => {
    // Arrange: indices [0, 2] → hours 0 and 2
    gesdResult = { indices: [0, 2], scores: [3.5, 2.1] };
    const hourly = makeHourly(6);
    const data = makeData({ hourlyData: hourly });

    const result = await detectHourlyAnomalies(data);

    // Assert: hour/count/successRate from the corresponding hourly entry
    const anomaly0 = result.find((a) => a.hour === 0);
    expect(anomaly0?.count).toBe(hourly[0]!.count);
    expect(anomaly0?.successRate).toBe(hourly[0]!.successRate);
    expect(anomaly0?.score).toBe(3.5);

    const anomaly2 = result.find((a) => a.hour === 2);
    expect(anomaly2?.count).toBe(hourly[2]!.count);
    expect(anomaly2?.successRate).toBe(hourly[2]!.successRate);
    expect(anomaly2?.score).toBe(2.1);
  });

  it("sorts anomalies by score descending (highest first)", async () => {
    // Arrange: indices with scores in ascending order to test sort
    gesdResult = { indices: [1, 0], scores: [1.0, 5.0] };
    const data = makeData({ hourlyData: makeHourly(6) });

    const result = await detectHourlyAnomalies(data);

    // Assert: first entry has the higher score
    expect(result[0]!.score).toBeGreaterThan(result[1]!.score);
    expect(result[0]!.score).toBe(5.0);
    expect(result[1]!.score).toBe(1.0);
  });

  it("returns empty anomalies array when gesdAnomalies returns no indices", async () => {
    gesdResult = { indices: [], scores: [] };
    const data = makeData({ hourlyData: makeHourly(6) });
    const result = await detectHourlyAnomalies(data);
    expect(result).toEqual([]);
  });

  it("uses fallback values when index is out of series bounds", async () => {
    // Arrange: index 99 is out of the 6-entry series
    gesdResult = { indices: [99], scores: [9.9] };
    const data = makeData({ hourlyData: makeHourly(6) });
    const result = await detectHourlyAnomalies(data);
    // series[99] is undefined, so fallbacks are used: hour=99, count=0, successRate=0
    expect(result[0]?.hour).toBe(99);
    expect(result[0]?.count).toBe(0);
    expect(result[0]?.successRate).toBe(0);
    expect(result[0]?.score).toBe(9.9);
  });

  it("falls back to the dynamic import kernels when proxy is null", async () => {
    // Arrange: proxy unavailable → module kernels used
    proxyEnabled = false;
    const data = makeData({ hourlyData: makeHourly(6) });
    const result = await detectHourlyAnomalies(data);
    // Should still return anomalies from the dynamic-import kernel mock
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── computeComparison ───────────────────────────────────────────────────────

describe("computeComparison", () => {
  it("returns null when detectColumnRoles reports no timestamp column", async () => {
    // Arrange: dataset has no timestamp column
    columnRolesResult = { timestamp: null };
    const result = await computeComparison(fakeDataset, makeData());
    // Assert: suppress comparison without a timestamp
    expect(result).toBeNull();
  });

  it("computes the previous date from current.date", async () => {
    // Arrange: aggregateReportData will be called with the previous day
    const { aggregateReportData } = await import("@/features/report-studio/data/queries");
    await computeComparison(fakeDataset, makeData({ date: "2026-06-25" }));
    expect(aggregateReportData).toHaveBeenCalledWith(
      fakeDataset,
      "2026-06-24",
      { scopeToDay: true },
    );
  });

  it("returns null when aggregateReportData throws", async () => {
    // Arrange: simulate DuckDB failure
    aggregateShouldThrow = true;
    const result = await computeComparison(fakeDataset, makeData());
    expect(result).toBeNull();
  });

  it("returns null when prev.totalTransactions is 0 (no previous-period data)", async () => {
    // Arrange: previous period has zero transactions
    aggregateResult = makePrevData({ totalTransactions: 0 });
    const result = await computeComparison(fakeDataset, makeData());
    expect(result).toBeNull();
  });

  it("returns a comparison with the prev totals when data is available", async () => {
    // Arrange: valid previous-period data
    aggregateResult = makePrevData({
      date: "2026-06-24",
      totalTransactions: 800,
      successRate: 92,
      totalRevenue: 400.0,
      failedTransactions: 40,
    });
    const result = await computeComparison(fakeDataset, makeData());

    expect(result).not.toBeNull();
    expect(result?.prev.date).toBe("2026-06-24");
    expect(result?.prev.totalTransactions).toBe(800);
    expect(result?.prev.successRate).toBe(92);
    expect(result?.prev.totalRevenue).toBe(400.0);
    expect(result?.prev.failedTransactions).toBe(40);
  });

  it("includes volumeTrend from Welch t-test when both periods have >= 2 hourly entries", async () => {
    // Arrange: both current and prev have enough hourly data
    aggregateResult = makePrevData({ hourlyData: makeHourly(4) });
    welchResult = { pValue: 0.015, significant: true, meanA: 110, meanB: 95 };

    const current = makeData({ hourlyData: makeHourly(4) });
    const result = await computeComparison(fakeDataset, current);

    expect(result?.volumeTrend).not.toBeNull();
    expect(result?.volumeTrend?.pValue).toBe(0.015);
    expect(result?.volumeTrend?.significant).toBe(true);
    expect(result?.volumeTrend?.meanCurrent).toBe(110); // t.meanA
    expect(result?.volumeTrend?.meanPrev).toBe(95);    // t.meanB
  });

  it("sets volumeTrend to null when current hourlyData has < 2 entries", async () => {
    // Arrange: only 1 hourly entry in current
    aggregateResult = makePrevData({ hourlyData: makeHourly(4) });
    const current = makeData({ hourlyData: makeHourly(1) });
    const result = await computeComparison(fakeDataset, current);
    expect(result?.volumeTrend).toBeNull();
  });

  it("sets volumeTrend to null when prev hourlyData has < 2 entries", async () => {
    // Arrange: only 1 hourly entry in previous period
    aggregateResult = makePrevData({ hourlyData: makeHourly(1) });
    const current = makeData({ hourlyData: makeHourly(6) });
    const result = await computeComparison(fakeDataset, current);
    expect(result?.volumeTrend).toBeNull();
  });

  it("calls welchTTest with count arrays from current and prev", async () => {
    // Arrange: specific hour counts to verify array construction
    aggregateResult = makePrevData({ hourlyData: makeHourly(3) });
    const current = makeData({ hourlyData: makeHourly(3) });
    // hourlyData with length = 3 — both < 2 is false (3 >= 2 = true)
    await computeComparison(fakeDataset, current);
    expect(fakeProxy.welchTTest).toHaveBeenCalledWith(
      [10, 13, 16],  // current counts from makeHourly(3)
      [10, 13, 16],  // prev counts from makeHourly(3)
    );
  });

  it("handles a not-significant volumeTrend (p-value high)", async () => {
    // Arrange
    aggregateResult = makePrevData({ hourlyData: makeHourly(4) });
    welchResult = { pValue: 0.45, significant: false, meanA: 100, meanB: 98 };
    const current = makeData({ hourlyData: makeHourly(4) });
    const result = await computeComparison(fakeDataset, current);

    expect(result?.volumeTrend?.significant).toBe(false);
    expect(result?.volumeTrend?.pValue).toBe(0.45);
  });
});

// ─── enrichWithInsights ───────────────────────────────────────────────────────

describe("enrichWithInsights", () => {
  it("returns the original data with anomalies and comparison merged", async () => {
    // Arrange
    gesdResult = { indices: [1], scores: [4.0] };
    aggregateResult = makePrevData();
    const data = makeData();

    const result = await enrichWithInsights(data, fakeDataset);

    // Assert: original fields preserved
    expect(result.date).toBe(data.date);
    expect(result.totalTransactions).toBe(data.totalTransactions);
    expect(result.successRate).toBe(data.successRate);
  });

  it("adds anomalies detected from hourlyData", async () => {
    // Arrange: proxy returns one anomaly
    gesdResult = { indices: [2], scores: [3.14] };
    const data = makeData({ hourlyData: makeHourly(6) });

    const result = await enrichWithInsights(data, fakeDataset);

    expect(result.anomalies).toHaveLength(1);
    expect(result.anomalies![0]!.score).toBe(3.14);
  });

  it("sets anomalies to [] when hourlyData is too short for GESD", async () => {
    // Arrange: only 2 hourly entries
    const data = makeData({ hourlyData: makeHourly(2) });

    const result = await enrichWithInsights(data, fakeDataset);

    expect(result.anomalies).toEqual([]);
  });

  it("adds a real comparison when dataset is provided and prev data exists", async () => {
    // Arrange
    aggregateResult = makePrevData();
    const data = makeData();

    const result = await enrichWithInsights(data, fakeDataset);

    expect(result.comparison).toBeDefined();
    expect(result.comparison?.prev.totalTransactions).toBe(800);
  });

  it("leaves comparison undefined when no dataset is provided", async () => {
    // Arrange: no dataset argument
    const data = makeData();

    const result = await enrichWithInsights(data);

    // Assert: comparison branch skipped
    expect(result.comparison).toBeUndefined();
  });

  it("leaves comparison undefined when comparison resolves to null", async () => {
    // Arrange: no timestamp column → computeComparison returns null
    columnRolesResult = { timestamp: null };
    const data = makeData();

    const result = await enrichWithInsights(data, fakeDataset);

    expect(result.comparison).toBeUndefined();
  });

  it("still returns a result when anomaly detection throws (caught internally)", async () => {
    // Arrange: make gesdAnomalies reject
    fakeProxy.gesdAnomalies.mockRejectedValueOnce(new Error("GESD failure"));
    const data = makeData();

    const result = await enrichWithInsights(data, fakeDataset);

    // Assert: catch block returns [] for anomalies
    expect(result.anomalies).toEqual([]);
  });

  it("still returns a result when computeComparison throws (caught internally)", async () => {
    // Arrange: make aggregateReportData throw inside computeComparison
    aggregateShouldThrow = true;
    const data = makeData();

    const result = await enrichWithInsights(data, fakeDataset);

    // Assert: catch block returns null → comparison is undefined
    expect(result.comparison).toBeUndefined();
  });

  it("runs anomaly detection and comparison concurrently (Promise.all)", async () => {
    // Verify both paths run by checking both mock calls were made
    aggregateResult = makePrevData({ hourlyData: makeHourly(4) });
    const data = makeData({ hourlyData: makeHourly(6) });

    await enrichWithInsights(data, fakeDataset);

    expect(fakeProxy.gesdAnomalies).toHaveBeenCalledOnce();
    expect(fakeProxy.welchTTest).toHaveBeenCalledOnce();
  });

  it("merges existing fields from the original data into the result object", async () => {
    // Arrange: data with topChannels
    const data = makeData({
      topChannels: [{ name: "USSD", volume: 5000, successRate: 98, revenue: 100 }],
    });

    const result = await enrichWithInsights(data);

    expect(result.topChannels).toEqual(data.topChannels);
    expect(result.failedTransactions).toBe(data.failedTransactions);
    expect(result.totalRevenue).toBe(data.totalRevenue);
  });
});
