import { describe, expect, it } from "vitest";
import {
  computeAIInsights,
  computeCanalRiskScore,
  detectHourlyAnomalies,
  generateNarrative,
  linearRegression,
} from "@/features/telecom/lib/insights";
import type { AIInsight, CanalSummary, HourlyRow, KPISummary } from "@/features/telecom/types";

// ─── Test fixtures ────────────────────────────────────────────────────────────

/** A minimal CanalSummary; the chart-irrelevant visual fields are stubbed. */
function canal(partial: Partial<CanalSummary> & { key: CanalSummary["key"] }): CanalSummary {
  return {
    key: partial.key,
    label: partial.label ?? partial.key,
    icon: (() => null) as unknown as CanalSummary["icon"],
    color: "",
    bgColor: "",
    borderColor: "",
    total: 0,
    success: 0,
    declined: 0,
    refund: 0,
    instance: 0,
    submitted: 0,
    amount: 0,
    successRate: 0,
    avgAmount: 0,
    share: 0,
    ...partial,
  };
}

function kpi(partial: Partial<KPISummary> = {}): KPISummary {
  return {
    totalTransactions: 0,
    successCount: 0,
    declinedCount: 0,
    refundCount: 0,
    instanceCount: 0,
    submittedCount: 0,
    successRate: 0,
    totalAmount: 0,
    avgAmount: 0,
    avgProcessingMs: 0,
    uniqueCustomers: 0,
    peakHour: 0,
    topErrorCode: "N/A",
    ...partial,
  };
}

function hourly(hour: number, total: number, success = total, declined = 0): HourlyRow {
  return { hour, total, success, declined, amount: total };
}

describe("detectHourlyAnomalies", () => {
  it("returns empty array with fewer than 4 hourly rows", () => {
    expect(detectHourlyAnomalies([hourly(0, 10), hourly(1, 20), hourly(2, 30)])).toEqual([]);
  });

  it("returns empty array when all volumes are identical (zero variance)", () => {
    const flat = Array.from({ length: 6 }, (_, h) => hourly(h, 100));
    expect(detectHourlyAnomalies(flat)).toEqual([]);
  });

  it("flags a clear spike above the z-score threshold", () => {
    // Five quiet hours, then a large spike — the spike is several sigmas out.
    const rows = [
      hourly(0, 10),
      hourly(1, 12),
      hourly(2, 11),
      hourly(3, 13),
      hourly(4, 9),
      hourly(5, 500),
    ];

    const anomalies = detectHourlyAnomalies(rows);

    const spike = anomalies.find((a) => a.hour === 5);
    expect(spike).toBeDefined();
    expect(spike?.type).toBe("spike");
    expect(spike?.zScore).toBeGreaterThan(1.8);
  });

  it("classifies a below-mean outlier as a drop", () => {
    const rows = [
      hourly(0, 100),
      hourly(1, 110),
      hourly(2, 105),
      hourly(3, 108),
      hourly(4, 102),
      hourly(5, 1),
    ];

    const drop = detectHourlyAnomalies(rows).find((a) => a.hour === 5);

    expect(drop?.type).toBe("drop");
    expect(drop?.zScore).toBeLessThan(0);
  });

  it("caps results at the five strongest anomalies sorted by magnitude", () => {
    const rows = Array.from({ length: 24 }, (_, h) => hourly(h, h % 2 === 0 ? 1000 : 1));

    const anomalies = detectHourlyAnomalies(rows);

    expect(anomalies.length).toBeLessThanOrEqual(5);
    // Sorted by descending absolute z-score.
    for (let i = 1; i < anomalies.length; i++) {
      expect(Math.abs(anomalies[i - 1].zScore)).toBeGreaterThanOrEqual(
        Math.abs(anomalies[i].zScore),
      );
    }
  });
});

describe("computeCanalRiskScore", () => {
  it("scores a perfectly healthy canal at zero", () => {
    const c = canal({
      key: "bill_payment",
      total: 1000,
      successRate: 100,
      refund: 0,
      instance: 0,
      share: 10,
    });

    expect(computeCanalRiskScore(c)).toBe(0);
  });

  it("penalises a low success rate (up to 50 points)", () => {
    const c = canal({
      key: "bill_payment",
      total: 1000,
      successRate: 0,
      refund: 0,
      instance: 0,
      share: 0,
    });

    // (100 - 0) * 0.5 = 50
    expect(computeCanalRiskScore(c)).toBe(50);
  });

  it("clamps the refund penalty at 20 points", () => {
    const c = canal({
      key: "bill_payment",
      total: 100,
      successRate: 100, // no fail penalty
      refund: 100, // 100% refund ratio → 200 raw → clamped to 20
      instance: 0,
      share: 0,
    });

    expect(computeCanalRiskScore(c)).toBe(20);
  });

  it("clamps the instance penalty at 15 points", () => {
    const c = canal({
      key: "bill_payment",
      total: 100,
      successRate: 100,
      refund: 0,
      instance: 100, // 100% → 150 raw → clamped to 15
      share: 0,
    });

    expect(computeCanalRiskScore(c)).toBe(15);
  });

  it("adds a concentration bonus only above a 40% share", () => {
    const below = canal({ key: "bill_payment", total: 1000, successRate: 100, share: 40 });
    const above = canal({ key: "bill_payment", total: 1000, successRate: 100, share: 60 });

    expect(computeCanalRiskScore(below)).toBe(0);
    // (60 - 40) * 0.3 = 6
    expect(computeCanalRiskScore(above)).toBe(6);
  });

  it("never exceeds 100", () => {
    const c = canal({
      key: "bill_payment",
      total: 1000,
      successRate: 0,
      refund: 1000,
      instance: 1000,
      share: 100,
    });

    expect(computeCanalRiskScore(c)).toBe(100);
  });

  it("avoids division by zero when total is zero", () => {
    const c = canal({ key: "bill_payment", total: 0, successRate: 100, refund: 5, instance: 5 });

    expect(Number.isFinite(computeCanalRiskScore(c))).toBe(true);
  });
});

describe("linearRegression", () => {
  it("returns a zero slope for fewer than two points", () => {
    expect(linearRegression([])).toEqual({ slope: 0, intercept: 0 });
    expect(linearRegression([[5, 42]])).toEqual({ slope: 0, intercept: 42 });
  });

  it("recovers the slope and intercept of a perfect line", () => {
    // y = 2x + 1
    const { slope, intercept } = linearRegression([
      [0, 1],
      [1, 3],
      [2, 5],
      [3, 7],
    ]);

    expect(slope).toBeCloseTo(2);
    expect(intercept).toBeCloseTo(1);
  });

  it("returns a flat line through the mean when all x are equal", () => {
    const { slope, intercept } = linearRegression([
      [5, 10],
      [5, 20],
      [5, 30],
    ]);

    expect(slope).toBe(0);
    expect(intercept).toBe(20); // mean of y
  });

  it("computes a negative slope for a descending series", () => {
    const { slope } = linearRegression([
      [0, 10],
      [1, 8],
      [2, 6],
    ]);

    expect(slope).toBeLessThan(0);
  });
});

describe("generateNarrative", () => {
  it("falls back to 'today' when no report date is supplied", () => {
    const text = generateNarrative(kpi({ totalTransactions: 100, successRate: 99 }), [], [], "");

    expect(text).toContain("today");
  });

  it("uses the excellent health word at or above 97% success", () => {
    const text = generateNarrative(
      kpi({ totalTransactions: 100, successRate: 98 }),
      [],
      [],
      "2026-06-16",
    );

    expect(text).toContain("excellente");
    expect(text).toContain("2026-06-16");
  });

  it("uses the poor health word below 80% success", () => {
    const text = generateNarrative(kpi({ totalTransactions: 100, successRate: 50 }), [], [], "d");

    expect(text).toContain("mauvaise");
  });

  it("contrasts the best and worst canals when they differ", () => {
    const canals = [
      canal({ key: "bill_payment", label: "Best", total: 1000, successRate: 99 }),
      canal({ key: "credit_transfer", label: "Worst", total: 1000, successRate: 40 }),
    ];

    const text = generateNarrative(
      kpi({ totalTransactions: 2000, successRate: 70 }),
      canals,
      [],
      "d",
    );

    expect(text).toContain("Best");
    expect(text).toContain("Worst");
  });

  it("mentions the top error code only when present and not N/A", () => {
    const withError = generateNarrative(
      kpi({ totalTransactions: 100, successRate: 80, declinedCount: 20, topErrorCode: "DCL" }),
      [],
      [],
      "d",
    );
    const withoutError = generateNarrative(
      kpi({ totalTransactions: 100, successRate: 80, declinedCount: 20, topErrorCode: "N/A" }),
      [],
      [],
      "d",
    );

    expect(withError).toContain("DCL");
    expect(withoutError).not.toContain("N/A");
  });

  it("reports the peak hour with zero-padded formatting", () => {
    const text = generateNarrative(
      kpi({ totalTransactions: 100, successRate: 90 }),
      [],
      [hourly(9, 60), hourly(10, 40)],
      "d",
    );

    expect(text).toContain("09:00");
  });
});

describe("computeAIInsights", () => {
  it("returns an empty list when there are no transactions", () => {
    expect(computeAIInsights(kpi({ totalTransactions: 0 }), [], [], [])).toEqual([]);
  });

  it("flags a KPI / status desynchronisation as critical", () => {
    const insights = computeAIInsights(
      kpi({ totalTransactions: 1000, successRate: 99 }),
      [],
      [],
      // Status rows total only 500 vs 1000 KPI → a large gap.
      [{ status: "SUCCESS", count: 500, amount: 0 }],
    );

    const gap = insights.find((i) => i.id === "status_sync_gap");
    expect(gap?.severity).toBe("critical");
  });

  it("raises a critical no-channel-match insight when zero success is classified", () => {
    const insights = computeAIInsights(
      kpi({ totalTransactions: 1000, successCount: 1000, successRate: 100 }),
      // canals classify 0 successes
      [canal({ key: "bill_payment", total: 0, success: 0 })],
      [],
      [{ status: "SUCCESS", count: 1000, amount: 0 }],
    );

    expect(insights.some((i) => i.id === "no_spec_channel_match")).toBe(true);
  });

  it("emits a positive insight for exceptional system health", () => {
    const insights = computeAIInsights(
      kpi({ totalTransactions: 1000, successCount: 1000, successRate: 99, declinedCount: 1 }),
      [canal({ key: "bill_payment", total: 1000, success: 1000, successRate: 99 })],
      [],
      [{ status: "SUCCESS", count: 1000, amount: 0 }],
    );

    const ok = insights.find((i) => i.id === "health_ok");
    expect(ok?.severity).toBe("positive");
  });

  it("emits a critical health insight below an 80% success rate", () => {
    const insights = computeAIInsights(
      kpi({ totalTransactions: 1000, successCount: 700, successRate: 70, declinedCount: 300 }),
      [canal({ key: "bill_payment", total: 1000, success: 700, successRate: 70 })],
      [],
      [{ status: "SUCCESS", count: 1000, amount: 0 }],
    );

    expect(insights.some((i) => i.id === "health_crit" && i.severity === "critical")).toBe(true);
  });

  it("detects a peak-hour traffic concentration above 15% of daily volume", () => {
    const insights = computeAIInsights(
      kpi({ totalTransactions: 1000, successCount: 990, successRate: 99 }),
      [canal({ key: "bill_payment", total: 1000, success: 990, successRate: 99 })],
      [hourly(14, 300, 300), hourly(10, 50, 50)], // 14h holds 30% of traffic
      [{ status: "SUCCESS", count: 1000, amount: 0 }],
    );

    const peak = insights.find((i) => i.id === "peak_hour");
    expect(peak).toBeDefined();
    expect(peak?.metric).toContain("14:00");
  });

  it("flags a reversal/refund anomaly above the 2% threshold", () => {
    const insights = computeAIInsights(
      kpi({
        totalTransactions: 1000,
        successCount: 950,
        successRate: 95,
        refundCount: 50, // 5% > 2%
      }),
      [canal({ key: "bill_payment", total: 1000, success: 950, successRate: 95 })],
      [],
      [{ status: "SUCCESS", count: 1000, amount: 0 }],
    );

    expect(insights.some((i) => i.id === "reversal")).toBe(true);
  });

  it("sorts critical insights before lower-severity ones and caps the list at eight", () => {
    const insights = computeAIInsights(
      kpi({
        totalTransactions: 1000,
        successCount: 600,
        successRate: 60, // critical health
        declinedCount: 400,
        refundCount: 60, // reversal warning
        instanceCount: 100, // instance warning
      }),
      [canal({ key: "bill_payment", total: 1000, success: 600, declined: 400, successRate: 60 })],
      [hourly(12, 500, 200, 300)],
      [
        { status: "SUCCESS", count: 600, amount: 0 },
        { status: "OTHER", count: 50, amount: 0 },
      ],
    );

    expect(insights.length).toBeLessThanOrEqual(8);
    const weight: Record<AIInsight["severity"], number> = {
      critical: 0,
      warning: 1,
      info: 2,
      positive: 3,
    };
    for (let i = 1; i < insights.length; i++) {
      expect(weight[insights[i].severity]).toBeGreaterThanOrEqual(weight[insights[i - 1].severity]);
    }
  });

  it("flags unmapped OTHER status codes as their own insight", () => {
    const insights = computeAIInsights(
      kpi({ totalTransactions: 1000, successCount: 900, successRate: 90 }),
      [canal({ key: "bill_payment", total: 1000, success: 900, successRate: 90 })],
      [],
      [
        { status: "SUCCESS", count: 900, amount: 0 },
        { status: "OTHER", count: 100, amount: 0 },
      ],
    );

    expect(insights.some((i) => i.id === "status_diversity")).toBe(true);
  });
});
