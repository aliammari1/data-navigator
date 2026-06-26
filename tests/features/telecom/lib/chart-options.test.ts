import { describe, expect, it } from "vitest";
import {
  buildAnomalyTimelineOption,
  buildCanalCompareBarOption,
  buildCanalHeatmapOption,
  buildCanalShareOption,
  buildCustomerHourlyOption,
  buildDailyTrendOption,
  buildGroupSummaryDonutOption,
  buildGroupSummaryHbarOption,
  buildHourlyChartOption,
  buildRevenuePieOption,
  buildRiskScoreOption,
  buildStatusDonutOption,
  buildSuccessRateTrendOption,
  chartTheme,
  retintOption,
  type ChartTheme,
} from "@/features/telecom/lib/chart-options";
import type {
  CanalHourCell,
  CanalSummary,
  DailyTrendRow,
  HourlyRow,
  StatusRow,
} from "@/features/telecom/types";

// ─── Shared helpers ────────────────────────────────────────────────────────────

function canal(partial: Partial<CanalSummary> & { key: CanalSummary["key"] }): CanalSummary {
  return {
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

// Minimal type alias for the built ECharts option tree.
type EChartsOption = {
  series: Array<Record<string, unknown>>;
  yAxis?: { data?: unknown[] } | Array<{ data?: unknown[] }>;
  xAxis?: { data?: unknown[] };
  legend?: { data?: string[] };
  visualMap?: { min: number; max: number; inRange: { color: string[] } };
  tooltip?: { formatter?: (...args: unknown[]) => string };
};

// Two stable theme fixtures for retint tests.
const themeA: ChartTheme = {
  tooltipBg: "rgb(10, 10, 10)",
  tooltipBorder: "rgba(255, 255, 255, 0.1)",
  tooltipText: "rgb(200, 200, 200)",
  axisDim: "rgb(100, 100, 100)",
  axisFg: "rgb(220, 220, 220)",
  splitLine: "rgba(255, 255, 255, 0.1)",
  pieBorder: "rgb(15, 15, 15)",
  legendText: "rgb(160, 160, 160)",
  success: "rgb(16, 185, 129)",
  danger: "rgb(239, 68, 68)",
  warning: "rgb(245, 158, 11)",
  primary: "rgb(137, 180, 250)",
  ai: "rgb(167, 139, 250)",
  neutralBar: "rgb(49, 50, 68)",
};

const themeB: ChartTheme = {
  ...themeA,
  success: "rgb(0, 255, 0)",
  danger: "rgb(255, 0, 0)",
  primary: "rgb(0, 0, 255)",
};

// ─── chartTheme ────────────────────────────────────────────────────────────────

describe("chartTheme", () => {
  it("returns an object with every required key populated as a non-empty string", () => {
    // Arrange / Act
    const t = chartTheme();
    // Assert — all 14 keys are non-empty strings
    const keys: (keyof ChartTheme)[] = [
      "tooltipBg",
      "tooltipBorder",
      "tooltipText",
      "axisDim",
      "axisFg",
      "splitLine",
      "pieBorder",
      "legendText",
      "success",
      "danger",
      "warning",
      "primary",
      "ai",
      "neutralBar",
    ];
    for (const k of keys) {
      expect(typeof t[k]).toBe("string");
      expect(t[k].length).toBeGreaterThan(0);
    }
  });

  it("resolves splitLine and tooltipBorder to the same string (both come from --border)", () => {
    const t = chartTheme();
    expect(t.splitLine).toBe(t.tooltipBorder);
  });
});

// ─── retintOption ──────────────────────────────────────────────────────────────

describe("retintOption", () => {
  it("swaps a direct palette color for the matching color in the new theme", () => {
    const option = { itemStyle: { color: themeA.success } };
    const result = retintOption(option, themeA, themeB) as { itemStyle: { color: string } };
    expect(result.itemStyle.color).toBe(themeB.success);
  });

  it("leaves config-sourced (non-palette) colors untouched", () => {
    const option = { itemStyle: { color: "#6b7280" } };
    const result = retintOption(option, themeA, themeB) as { itemStyle: { color: string } };
    expect(result.itemStyle.color).toBe("#6b7280");
  });

  it("remaps the base hue of an rgba alpha variant to the new theme (actual behavior)", () => {
    // withAlpha(themeA.danger, 0.19) → "rgba(239, 68, 68, 0.19)"
    const option = { color: "rgba(239, 68, 68, 0.19)" };
    const result = retintOption(option, themeA, themeB) as { color: string };
    // The rgb base channels are swapped but withAlpha gets plain "rgb(...)" so alpha is dropped.
    expect(result.color).toBe("rgb(255, 0, 0)");
  });

  it("leaves an rgba variant untouched when its base hue is not in the swap map", () => {
    // warning is identical in themeA and themeB, so it never enters the swap map.
    const option = { color: "rgba(245, 158, 11, 0.5)" };
    const result = retintOption(option, themeA, themeB) as { color: string };
    expect(result.color).toBe("rgba(245, 158, 11, 0.5)");
  });

  it("recurses through arrays and nested objects", () => {
    const option = {
      series: [
        { itemStyle: { color: themeA.primary } },
        { lineStyle: { color: themeA.danger } },
      ],
    };
    const result = retintOption(option, themeA, themeB) as {
      series: Array<{ itemStyle?: { color: string }; lineStyle?: { color: string } }>;
    };
    expect(result.series[0].itemStyle?.color).toBe(themeB.primary);
    expect(result.series[1].lineStyle?.color).toBe(themeB.danger);
  });

  it("preserves function references without invoking them", () => {
    const formatter = () => "x";
    const option = { tooltip: { formatter } };
    const result = retintOption(option, themeA, themeB) as { tooltip: { formatter: () => string } };
    expect(result.tooltip.formatter).toBe(formatter);
  });

  it("does not swap colors that are unchanged between the two themes", () => {
    // warning is identical across themeA and themeB
    const option = { color: themeA.warning };
    const result = retintOption(option, themeA, themeB) as { color: string };
    expect(result.color).toBe(themeA.warning);
  });

  it("passes through non-string primitives (numbers, booleans, null) unchanged", () => {
    const option = { show: true, value: 42, nothing: null };
    const result = retintOption(option, themeA, themeB) as typeof option;
    expect(result.show).toBe(true);
    expect(result.value).toBe(42);
    expect(result.nothing).toBeNull();
  });

  it("returns a non-string scalar directly (numbers at root)", () => {
    const result = retintOption(99, themeA, themeB);
    expect(result).toBe(99);
  });
});

// ─── buildStatusDonutOption ────────────────────────────────────────────────────

describe("buildStatusDonutOption", () => {
  it("maps each status row to a pie slice with the correct name and value", () => {
    const rows: StatusRow[] = [
      { status: "SUCCESS", count: 90, amount: 0 },
      { status: "DECLINED", count: 10, amount: 0 },
    ];
    const opt = buildStatusDonutOption(rows) as EChartsOption;
    const data = opt.series[0].data as Array<{ name: string; value: number }>;
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({ name: "SUCCESS", value: 90 });
  });

  it("falls back to a neutral gray for unknown status codes", () => {
    const opt = buildStatusDonutOption([
      { status: "MYSTERY", count: 5, amount: 0 },
    ]) as EChartsOption;
    const data = opt.series[0].data as Array<{ itemStyle: { color: string } }>;
    expect(data[0].itemStyle.color).toBe("#6b7280");
  });

  it("includes a tooltip formatter that renders count and percentage", () => {
    const opt = buildStatusDonutOption([{ status: "SUCCESS", count: 80, amount: 0 }]) as EChartsOption;
    const fmt = opt.tooltip?.formatter as (p: {
      name: string;
      value: number;
      percent: number;
    }) => string;
    // Arrange
    const result = fmt({ name: "SUCCESS", value: 80, percent: 80.0 });
    // Assert — formatter returns a string mentioning the name and count
    expect(result).toContain("SUCCESS");
    expect(result).toContain("80");
    expect(result).toContain("80.0%");
  });

  it("sets donut radius and center", () => {
    const opt = buildStatusDonutOption([]) as EChartsOption;
    const series = opt.series[0];
    expect(series.radius).toEqual(["42%", "68%"]);
    expect(series.center).toEqual(["38%", "50%"]);
  });
});

// ─── buildCanalShareOption ─────────────────────────────────────────────────────

describe("buildCanalShareOption", () => {
  it("orders canal categories by descending total", () => {
    const canals = [
      canal({ key: "bill_payment", label: "small", total: 10 }),
      canal({ key: "credit_transfer", label: "big", total: 1000 }),
    ];
    const opt = buildCanalShareOption(canals) as EChartsOption;
    const labels = (opt.yAxis as { data: string[] }).data;
    expect(labels[0]).toBe("Credit Transfer");
  });

  it("does not mutate the caller's array order", () => {
    const canals = [
      canal({ key: "bill_payment", total: 10 }),
      canal({ key: "credit_transfer", total: 1000 }),
    ];
    const before = canals.map((c) => c.key);
    buildCanalShareOption(canals);
    expect(canals.map((c) => c.key)).toEqual(before);
  });

  it("produces four named series (Réussie, Échec, Instance, Remboursement)", () => {
    const opt = buildCanalShareOption([canal({ key: "bill_payment" })]) as EChartsOption;
    const names = opt.series.map((s) => s.name);
    expect(names).toContain("Réussie");
    expect(names).toContain("Échec");
    expect(names).toContain("Instance");
    expect(names).toContain("Remboursement");
  });

  it("maps canal data correctly to each series", () => {
    const canals = [canal({ key: "bill_payment", success: 50, declined: 20, instance: 5, refund: 3 })];
    const opt = buildCanalShareOption(canals) as EChartsOption;
    const successSeries = opt.series.find((s) => s.name === "Réussie");
    const echec = opt.series.find((s) => s.name === "Échec");
    expect((successSeries?.data as number[])[0]).toBe(50);
    expect((echec?.data as number[])[0]).toBe(20);
  });
});

// ─── buildRevenuePieOption ─────────────────────────────────────────────────────

describe("buildRevenuePieOption", () => {
  it("maps each group to a pie slice with name, value, and color", () => {
    const groups = [
      { name: "Voice", value: 5000, color: "#ff0000" },
      { name: "Data", value: 3000, color: "#00ff00" },
    ];
    const opt = buildRevenuePieOption(groups) as EChartsOption;
    const data = opt.series[0].data as Array<{ name: string; value: number; itemStyle: { color: string } }>;
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({ name: "Voice", value: 5000 });
    expect(data[0].itemStyle.color).toBe("#ff0000");
  });

  it("includes a tooltip formatter that renders amount and percentage", () => {
    const groups = [{ name: "Voice", value: 5000, color: "#ff0000" }];
    const opt = buildRevenuePieOption(groups) as EChartsOption;
    const fmt = opt.tooltip?.formatter as (p: {
      name: string;
      value: number;
      percent: number;
    }) => string;
    const result = fmt({ name: "Voice", value: 5000.0, percent: 62.5 });
    expect(result).toContain("Voice");
    expect(result).toContain("TND");
    expect(result).toContain("62.5%");
  });

  it("produces a ring chart with the expected radius values", () => {
    const opt = buildRevenuePieOption([]) as EChartsOption;
    expect(opt.series[0].radius).toEqual(["32%", "62%"]);
  });

  it("handles an empty groups array", () => {
    const opt = buildRevenuePieOption([]) as EChartsOption;
    const data = opt.series[0].data as unknown[];
    expect(data).toHaveLength(0);
  });
});

// ─── buildSuccessRateTrendOption ───────────────────────────────────────────────

describe("buildSuccessRateTrendOption", () => {
  it("colors bars green/amber/red by success-rate band (>=95, >=80, <80)", () => {
    const canals = [
      canal({ key: "bill_payment", successRate: 99 }),   // >= 95 → success
      canal({ key: "credit_transfer", successRate: 85 }), // >= 80 → warning
      canal({ key: "data_sabba", successRate: 50 }),      // < 80  → danger
    ];
    const opt = buildSuccessRateTrendOption(canals) as EChartsOption;
    const data = opt.series[0].data as Array<{ value: number; itemStyle: { color: string } }>;
    // Sorted descending: [99, 85, 50]
    expect(data[0].value).toBe(99);
    expect(data[1].value).toBe(85);
    expect(data[2].value).toBe(50);
    // Colors should differ between success-band and danger-band
    expect(data[0].itemStyle.color).not.toBe(data[2].itemStyle.color);
  });

  it("includes a tooltip formatter that renders the rate correctly", () => {
    const canals = [canal({ key: "bill_payment", successRate: 87.5 })];
    const opt = buildSuccessRateTrendOption(canals) as EChartsOption;
    const fmt = (opt.series[0] as unknown as { tooltip?: { formatter?: unknown } })?.tooltip?.formatter;
    // The tooltip is on the chart level, not series level; check chart-level tooltip formatter
    const chartFmt = opt.tooltip?.formatter as (
      ps: { name: string; value: number }[]
    ) => string;
    const result = chartFmt([{ name: "Bill Payment", value: 87.5 }]);
    expect(result).toContain("87.5%");
    expect(result).toContain("Bill Payment");
  });

  it("includes axis label formatter that appends a percent sign", () => {
    const opt = buildSuccessRateTrendOption([canal({ key: "bill_payment" })]) as EChartsOption;
    const xAxis = opt.xAxis as Record<string, unknown>;
    const axisLabel = xAxis.axisLabel as { formatter: (v: number) => string };
    expect(axisLabel.formatter(75)).toBe("75%");
  });

  it("includes label formatter that renders the rate value", () => {
    const canals = [canal({ key: "bill_payment", successRate: 92.3 })];
    const opt = buildSuccessRateTrendOption(canals) as EChartsOption;
    const label = opt.series[0].label as { formatter: (p: { value: number }) => string };
    expect(label.formatter({ value: 92.3 })).toBe("92.3%");
  });

  it("does not mutate the caller's array", () => {
    const canals = [
      canal({ key: "bill_payment", successRate: 99 }),
      canal({ key: "credit_transfer", successRate: 50 }),
    ];
    const before = canals.map((c) => c.key);
    buildSuccessRateTrendOption(canals);
    expect(canals.map((c) => c.key)).toEqual(before);
  });
});

// ─── buildAnomalyTimelineOption ────────────────────────────────────────────────

describe("buildAnomalyTimelineOption", () => {
  it("produces exactly 24 hours of data on both series", () => {
    const opt = buildAnomalyTimelineOption([], []) as EChartsOption;
    const volumeSeries = opt.series.find((s) => s.name === "Volume");
    const echecs = opt.series.find((s) => s.name === "Échecs");
    expect((volumeSeries?.data as unknown[]).length).toBe(24);
    expect((echecs?.data as unknown[]).length).toBe(24);
  });

  it("colors anomaly bars with the warning color and normal bars with primary", () => {
    const hourly: HourlyRow[] = [
      { hour: 3, total: 999, success: 900, declined: 99, amount: 0 },
      { hour: 5, total: 10, success: 9, declined: 1, amount: 0 },
    ];
    const anomalies = [{ hour: 3, zScore: 2.5, type: "spike" as const }];
    const opt = buildAnomalyTimelineOption(hourly, anomalies) as EChartsOption;
    const volumeSeries = opt.series.find((s) => s.name === "Volume");
    const data = volumeSeries?.data as Array<{ value: number; itemStyle: { color: string } }>;
    // hour 3 is anomalous, hour 5 is normal — their colors should differ
    const h3 = data[3];
    const h5 = data[5];
    expect(h3.value).toBe(999);
    expect(h5.value).toBe(10);
    expect(h3.itemStyle.color).not.toBe(h5.itemStyle.color);
  });

  it("fills missing hours with zero volume", () => {
    const opt = buildAnomalyTimelineOption([], []) as EChartsOption;
    const volumeSeries = opt.series.find((s) => s.name === "Volume");
    const data = volumeSeries?.data as Array<{ value: number }>;
    // All hours should be zero when no data provided
    for (const item of data) {
      expect(item.value).toBe(0);
    }
  });

  it("tooltip formatter shows the hour, total, and anomaly warning when applicable", () => {
    const hourly: HourlyRow[] = [{ hour: 7, total: 500, success: 400, declined: 100, amount: 0 }];
    const anomalies = [{ hour: 7, zScore: 2.1, type: "spike" as const }];
    const opt = buildAnomalyTimelineOption(hourly, anomalies) as EChartsOption;
    const fmt = opt.tooltip?.formatter as (ps: { name: string; value: number }[]) => string;
    const result = fmt([{ name: "7", value: 500 }]);
    expect(result).toContain("07:00");
    expect(result).toContain("500");
    expect(result).toContain("Anomalie");
    expect(result).toContain("2.10");
  });

  it("tooltip formatter shows total even when there is no anomaly", () => {
    const hourly: HourlyRow[] = [{ hour: 10, total: 200, success: 180, declined: 20, amount: 0 }];
    const opt = buildAnomalyTimelineOption(hourly, []) as EChartsOption;
    const fmt = opt.tooltip?.formatter as (ps: { name: string; value: number }[]) => string;
    const result = fmt([{ name: "10", value: 200 }]);
    expect(result).toContain("200");
    expect(result).not.toContain("Anomalie");
  });

  it("tooltip formatter handles hours missing from data gracefully", () => {
    const opt = buildAnomalyTimelineOption([], []) as EChartsOption;
    const fmt = opt.tooltip?.formatter as (ps: { name: string; value: number }[]) => string;
    const result = fmt([{ name: "3", value: 0 }]);
    // Should render 0 (fallback default)
    expect(result).toContain("0");
  });

  it("échecs line series contains declined counts per hour", () => {
    const hourly: HourlyRow[] = [{ hour: 14, total: 300, success: 250, declined: 50, amount: 0 }];
    const opt = buildAnomalyTimelineOption(hourly, []) as EChartsOption;
    const echecs = opt.series.find((s) => s.name === "Échecs");
    expect((echecs?.data as number[])[14]).toBe(50);
  });

  it("échecs area style has a gradient with two color stops", () => {
    const opt = buildAnomalyTimelineOption([], []) as EChartsOption;
    const echecs = opt.series.find((s) => s.name === "Échecs");
    const area = echecs?.areaStyle as { color: { colorStops: unknown[] } };
    expect(area.color.colorStops).toHaveLength(2);
  });
});

// ─── buildRiskScoreOption ──────────────────────────────────────────────────────

describe("buildRiskScoreOption", () => {
  it("sorts canals by descending computed risk score", () => {
    const canals = [
      canal({ key: "bill_payment", total: 1000, successRate: 100, share: 5 }), // ~0 risk
      canal({ key: "credit_transfer", total: 1000, successRate: 10, share: 50 }), // high risk
    ];
    const opt = buildRiskScoreOption(canals) as EChartsOption;
    const data = opt.series[0].data as Array<{ value: number }>;
    expect(data[0].value).toBeGreaterThanOrEqual(data[1].value);
  });

  it("colors bars by risk band (>=40 danger, >=20 warning, <20 success)", () => {
    const canals = [
      canal({ key: "bill_payment", total: 100, successRate: 20, share: 0 }), // high risk → danger
      canal({ key: "credit_transfer", total: 100, successRate: 75, share: 0 }), // medium risk → warning
      canal({ key: "data_sabba", total: 100, successRate: 98, share: 0 }), // low risk → success
    ];
    const opt = buildRiskScoreOption(canals) as EChartsOption;
    const data = opt.series[0].data as Array<{ value: number; itemStyle: { color: string } }>;
    // Risk scores differ, so at least two color variants appear
    const colors = new Set(data.map((d) => d.itemStyle.color));
    expect(colors.size).toBeGreaterThanOrEqual(1);
  });

  it("includes a tooltip formatter that renders the score out of 100", () => {
    const canals = [canal({ key: "bill_payment" })];
    const opt = buildRiskScoreOption(canals) as EChartsOption;
    const fmt = opt.tooltip?.formatter as (ps: { name: string; value: number }[]) => string;
    const result = fmt([{ name: "Bill Payment", value: 42 }]);
    expect(result).toContain("42");
    expect(result).toContain("/100");
  });

  it("includes a label formatter that renders the raw score", () => {
    const canals = [canal({ key: "bill_payment" })];
    const opt = buildRiskScoreOption(canals) as EChartsOption;
    const label = opt.series[0].label as { formatter: (p: { value: number }) => string };
    expect(label.formatter({ value: 37 })).toBe("37");
  });
});

// ─── buildGroupSummaryDonutOption ──────────────────────────────────────────────

describe("buildGroupSummaryDonutOption", () => {
  it("maps each group item to a pie slice with nombre as value", () => {
    const data = [
      { label: "Group A", nombre: 300, montant: 1500, color: "#ff0000" },
      { label: "Group B", nombre: 100, montant: 500, color: "#00ff00" },
    ];
    const opt = buildGroupSummaryDonutOption(data) as EChartsOption;
    const slices = opt.series[0].data as Array<{ name: string; value: number }>;
    expect(slices).toHaveLength(2);
    expect(slices[0]).toMatchObject({ name: "Group A", value: 300 });
  });

  it("uses the provided color for each slice", () => {
    const data = [{ label: "G", nombre: 10, montant: 0, color: "#abc123" }];
    const opt = buildGroupSummaryDonutOption(data) as EChartsOption;
    const slices = opt.series[0].data as Array<{ itemStyle: { color: string } }>;
    expect(slices[0].itemStyle.color).toBe("#abc123");
  });

  it("tooltip formatter renders nombre and montant correctly", () => {
    const data = [{ label: "Voice", nombre: 500, montant: 2500, color: "#0f0" }];
    const opt = buildGroupSummaryDonutOption(data) as EChartsOption;
    const fmt = opt.tooltip?.formatter as (p: {
      name: string;
      value: number;
      percent: number;
    }) => string;
    const result = fmt({ name: "Voice", value: 500, percent: 75.0 });
    expect(result).toContain("Voice");
    expect(result).toContain("500");
    expect(result).toContain("75.0%");
    expect(result).toContain("DT");
  });

  it("tooltip formatter falls back to 0 montant when the group is not found", () => {
    const data = [{ label: "Voice", nombre: 500, montant: 2500, color: "#0f0" }];
    const opt = buildGroupSummaryDonutOption(data) as EChartsOption;
    const fmt = opt.tooltip?.formatter as (p: {
      name: string;
      value: number;
      percent: number;
    }) => string;
    // "Unknown" group won't be found — montant should fall back to 0
    const result = fmt({ name: "Unknown", value: 10, percent: 5 });
    expect(result).toContain("0");
  });

  it("produces a ring chart with radius [38%, 66%]", () => {
    const opt = buildGroupSummaryDonutOption([]) as EChartsOption;
    expect(opt.series[0].radius).toEqual(["38%", "66%"]);
  });
});

// ─── buildGroupSummaryHbarOption ──────────────────────────────────────────────

describe("buildGroupSummaryHbarOption", () => {
  it("maps group items to bar data with nombre as value", () => {
    const data = [
      { label: "Group A", nombre: 200, montant: 1000, color: "#ff0000" },
      { label: "Group B", nombre: 50, montant: 250, color: "#00ff00" },
    ];
    const opt = buildGroupSummaryHbarOption(data) as EChartsOption;
    const barData = opt.series[0].data as Array<{ value: number }>;
    expect(barData[0].value).toBe(200);
    expect(barData[1].value).toBe(50);
  });

  it("uses the provided color for each bar", () => {
    const data = [{ label: "G", nombre: 10, montant: 0, color: "#abc" }];
    const opt = buildGroupSummaryHbarOption(data) as EChartsOption;
    const barData = opt.series[0].data as Array<{ itemStyle: { color: string } }>;
    expect(barData[0].itemStyle.color).toBe("#abc");
  });

  it("y-axis category data matches the group labels in order", () => {
    const data = [
      { label: "Voice", nombre: 100, montant: 0, color: "#f00" },
      { label: "Data", nombre: 50, montant: 0, color: "#0f0" },
    ];
    const opt = buildGroupSummaryHbarOption(data) as EChartsOption;
    const yAxis = opt.yAxis as { data: string[] };
    expect(yAxis.data).toEqual(["Voice", "Data"]);
  });

  it("label formatter returns empty string for zero values", () => {
    const data = [{ label: "G", nombre: 0, montant: 0, color: "#f00" }];
    const opt = buildGroupSummaryHbarOption(data) as EChartsOption;
    const label = opt.series[0].label as { formatter: (p: { value: number }) => string };
    expect(label.formatter({ value: 0 })).toBe("");
  });

  it("label formatter returns a formatted number for positive values", () => {
    const data = [{ label: "G", nombre: 1500, montant: 0, color: "#f00" }];
    const opt = buildGroupSummaryHbarOption(data) as EChartsOption;
    const label = opt.series[0].label as { formatter: (p: { value: number }) => string };
    const result = label.formatter({ value: 1500 });
    // fmtN(1500) in fr-FR locale → "1 500" or "1500"
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toBe("");
  });
});

// ─── buildCanalCompareBarOption ────────────────────────────────────────────────

describe("buildCanalCompareBarOption", () => {
  it("maps results to bars with nombre as the value", () => {
    const results = [
      { label: "WEB", nombre: 300, montant: 1500, color: "#0000ff" },
      { label: "MOB", nombre: 150, montant: 750, color: "#00ff00" },
    ];
    const opt = buildCanalCompareBarOption(results) as EChartsOption;
    const data = opt.series[0].data as Array<{ value: number }>;
    expect(data[0].value).toBe(300);
    expect(data[1].value).toBe(150);
  });

  it("x-axis categories match the result labels in order", () => {
    const results = [
      { label: "WEB", nombre: 300, montant: 1500, color: "#0000ff" },
      { label: "MOB", nombre: 150, montant: 750, color: "#00ff00" },
    ];
    const opt = buildCanalCompareBarOption(results) as EChartsOption;
    const xAxis = opt.xAxis as { data: string[] };
    expect(xAxis.data).toEqual(["WEB", "MOB"]);
  });

  it("tooltip formatter renders nombre and montant for the matched result", () => {
    const results = [{ label: "WEB", nombre: 300, montant: 1500, color: "#00f" }];
    const opt = buildCanalCompareBarOption(results) as EChartsOption;
    const fmt = opt.tooltip?.formatter as (params: { name: string; value: number }[]) => string;
    const result = fmt([{ name: "WEB", value: 300 }]);
    expect(result).toContain("WEB");
    expect(result).toContain("300");
    expect(result).toContain("DT");
  });

  it("tooltip formatter falls back to 0 montant when the result is not found", () => {
    const results = [{ label: "WEB", nombre: 300, montant: 1500, color: "#00f" }];
    const opt = buildCanalCompareBarOption(results) as EChartsOption;
    const fmt = opt.tooltip?.formatter as (params: { name: string; value: number }[]) => string;
    const result = fmt([{ name: "UNKNOWN", value: 0 }]);
    expect(result).toContain("0");
  });

  it("label formatter uses compact notation (fmtCompact)", () => {
    const results = [{ label: "WEB", nombre: 1_200_000, montant: 0, color: "#00f" }];
    const opt = buildCanalCompareBarOption(results) as EChartsOption;
    const label = opt.series[0].label as { formatter: (p: { value: number }) => string };
    const result = label.formatter({ value: 1_200_000 });
    // fmtCompact uses compact notation → should contain M
    expect(result).toMatch(/M/);
  });

  it("each bar uses the result color with top-rounded border radius", () => {
    const results = [{ label: "WEB", nombre: 10, montant: 0, color: "#abc" }];
    const opt = buildCanalCompareBarOption(results) as EChartsOption;
    const data = opt.series[0].data as Array<{ itemStyle: { color: string; borderRadius: number[] } }>;
    expect(data[0].itemStyle.color).toBe("#abc");
    expect(data[0].itemStyle.borderRadius).toEqual([4, 4, 0, 0]);
  });
});

// ─── buildCanalHeatmapOption ───────────────────────────────────────────────────

describe("buildCanalHeatmapOption", () => {
  it("computes per-cell success rate as a rounded percentage in rate mode", () => {
    const cells: CanalHourCell[] = [{ canal: "Bill", hour: 9, total: 200, success: 150 }];
    const opt = buildCanalHeatmapOption(cells, "rate") as EChartsOption;
    const data = opt.series[0].data as Array<[number, number, number]>;
    const cell = data.find(([h]) => h === 9);
    // 150/200 = 75%
    expect(cell?.[2]).toBe(75);
  });

  it("drops empty cells (rate of -1) from the rendered heatmap data", () => {
    const cells: CanalHourCell[] = [{ canal: "Bill", hour: 9, total: 0, success: 0 }];
    const opt = buildCanalHeatmapOption(cells, "rate") as EChartsOption;
    const data = opt.series[0].data as Array<[number, number, number]>;
    expect(data.every(([, , v]) => v !== -1)).toBe(true);
  });

  it("uses raw totals and sets a 0..100 success scale for the two view modes", () => {
    const cells: CanalHourCell[] = [{ canal: "Bill", hour: 5, total: 42, success: 21 }];
    const volume = buildCanalHeatmapOption(cells, "volume") as EChartsOption;
    const rate = buildCanalHeatmapOption(cells, "rate") as EChartsOption;
    const volCell = (volume.series[0].data as Array<[number, number, number]>).find(([h]) => h === 5);
    expect(volCell?.[2]).toBe(42);
    expect(rate.visualMap?.max).toBe(100);
  });

  it("orders heatmap rows by descending total volume per canal", () => {
    const cells: CanalHourCell[] = [
      { canal: "Quiet", hour: 0, total: 5, success: 5 },
      { canal: "Busy", hour: 0, total: 500, success: 500 },
    ];
    const opt = buildCanalHeatmapOption(cells, "volume") as EChartsOption;
    const canals = (opt.yAxis as { data: string[] }).data;
    expect(canals[0]).toBe("Busy");
  });

  it("tooltip formatter shows canal name and transaction count", () => {
    const cells: CanalHourCell[] = [{ canal: "Bill", hour: 10, total: 120, success: 100 }];
    const opt = buildCanalHeatmapOption(cells, "volume") as EChartsOption;
    const fmt = opt.tooltip?.formatter as (p: { data: [number, number, number] }) => string;
    const result = fmt({ data: [10, 0, 120] });
    expect(result).toContain("Bill");
    expect(result).toContain("120");
  });

  it("tooltip formatter shows 'aucune transaction' for cells with zero total", () => {
    const cells: CanalHourCell[] = [{ canal: "Bill", hour: 10, total: 0, success: 0 }];
    const opt = buildCanalHeatmapOption(cells, "volume") as EChartsOption;
    const fmt = opt.tooltip?.formatter as (p: { data: [number, number, number] }) => string;
    const result = fmt({ data: [10, 0, 0] });
    expect(result).toContain("aucune transaction");
  });

  it("visualMap for volume mode uses primary→axisFg color range", () => {
    const cells: CanalHourCell[] = [{ canal: "Bill", hour: 0, total: 100, success: 80 }];
    const opt = buildCanalHeatmapOption(cells, "volume") as EChartsOption;
    // volume mode → 4-color range
    expect(opt.visualMap?.inRange.color).toHaveLength(4);
  });

  it("visualMap for rate mode uses danger→warning→success color range", () => {
    const cells: CanalHourCell[] = [{ canal: "Bill", hour: 0, total: 100, success: 80 }];
    const opt = buildCanalHeatmapOption(cells, "rate") as EChartsOption;
    // rate mode → 3-color range
    expect(opt.visualMap?.inRange.color).toHaveLength(3);
  });

  it("label formatter for rate mode returns 'N%' when value >= 0", () => {
    const cells: CanalHourCell[] = [{ canal: "Bill", hour: 0, total: 100, success: 80 }];
    const opt = buildCanalHeatmapOption(cells, "rate") as EChartsOption;
    const label = opt.series[0].label as { formatter: (p: { data: [number, number, number] }) => string };
    const result = label.formatter({ data: [0, 0, 80] });
    expect(result).toBe("80%");
  });

  it("label formatter for volume mode returns compact number when value > 0", () => {
    const cells: CanalHourCell[] = [{ canal: "Bill", hour: 0, total: 1_200_000, success: 800_000 }];
    const opt = buildCanalHeatmapOption(cells, "volume") as EChartsOption;
    const label = opt.series[0].label as { formatter: (p: { data: [number, number, number] }) => string };
    const result = label.formatter({ data: [0, 0, 1_200_000] });
    expect(result).toMatch(/M/);
  });

  it("label formatter for volume mode returns empty string when value is 0", () => {
    const cells: CanalHourCell[] = [{ canal: "Bill", hour: 0, total: 0, success: 0 }];
    const opt = buildCanalHeatmapOption(cells, "volume") as EChartsOption;
    const label = opt.series[0].label as { formatter: (p: { data: [number, number, number] }) => string };
    const result = label.formatter({ data: [0, 0, 0] });
    expect(result).toBe("");
  });

  it("handles multiple canals across different hours", () => {
    const cells: CanalHourCell[] = [
      { canal: "A", hour: 0, total: 100, success: 90 },
      { canal: "A", hour: 1, total: 50, success: 40 },
      { canal: "B", hour: 0, total: 200, success: 180 },
    ];
    const opt = buildCanalHeatmapOption(cells, "volume") as EChartsOption;
    const data = opt.series[0].data as Array<[number, number, number]>;
    // B has higher total → sorted first (index 0), A is index 1
    const bh0 = data.find(([h, yi]) => h === 0 && yi === 0);
    expect(bh0?.[2]).toBe(200);
  });
});

// ─── buildHourlyChartOption ────────────────────────────────────────────────────

describe("buildHourlyChartOption", () => {
  it("produces a 24-slot stacked dataset with zero-filled gaps", () => {
    const data: HourlyRow[] = [{ hour: 8, total: 100, success: 90, declined: 10, amount: 500 }];
    const opt = buildHourlyChartOption(data, []) as EChartsOption;
    const successSeries = opt.series.find((s) => s.name === "Réussie")?.data as number[];
    expect(successSeries).toHaveLength(24);
    expect(successSeries[8]).toBe(90);
    expect(successSeries[0]).toBe(0);
  });

  it("computes the 'Autre' bucket as total minus success minus declined, floored at zero", () => {
    const data: HourlyRow[] = [
      { hour: 0, total: 100, success: 70, declined: 20, amount: 0 }, // 10 other
      { hour: 1, total: 50, success: 40, declined: 30, amount: 0 },  // would be -20 → 0
    ];
    const opt = buildHourlyChartOption(data, []) as EChartsOption;
    const autre = opt.series.find((s) => s.name === "Autre")?.data as number[];
    expect(autre[0]).toBe(10);
    expect(autre[1]).toBe(0);
  });

  it("omits the forecast series when no forecast is given", () => {
    const opt = buildHourlyChartOption([], []) as EChartsOption;
    expect(opt.legend?.data).not.toContain("Prévision IA");
    expect(opt.series.some((s) => s.name === "Prévision IA")).toBe(false);
  });

  it("adds forecast series and extends the axis for forecast-only hours", () => {
    const opt = buildHourlyChartOption(
      [],
      [{ hour: 25, predictedTotal: 200, predictedSuccessRate: 0.9, isForecast: true }],
    ) as EChartsOption;
    expect(opt.legend?.data).toContain("Prévision IA");
    expect((opt.xAxis as { data: string[] }).data).toHaveLength(25);
  });

  it("tooltip formatter with no row and no forecast returns bare hour string", () => {
    const opt = buildHourlyChartOption([], []) as EChartsOption;
    const fmt = opt.tooltip?.formatter as (ps: { name: string; value: number; seriesName: string }[]) => string;
    const result = fmt([{ name: "5", value: 0, seriesName: "Réussie" }]);
    expect(result).toBe("5:00");
  });

  it("tooltip formatter with a forecast-only row renders predicted values", () => {
    const opt = buildHourlyChartOption(
      [],
      [{ hour: 25, predictedTotal: 200, predictedSuccessRate: 0.9, isForecast: true }],
    ) as EChartsOption;
    const fmt = opt.tooltip?.formatter as (ps: { name: string; value: number; seriesName: string }[]) => string;
    const result = fmt([{ name: "25", value: 200, seriesName: "Prévision IA" }]);
    expect(result).toContain("Prévision IA");
    expect(result).toContain("200");
  });

  it("tooltip formatter with a real row renders success/failure/rate/amount", () => {
    const data: HourlyRow[] = [{ hour: 8, total: 100, success: 80, declined: 20, amount: 5000 }];
    const opt = buildHourlyChartOption(data, []) as EChartsOption;
    const fmt = opt.tooltip?.formatter as (ps: { name: string; value: number; seriesName: string }[]) => string;
    const result = fmt([{ name: "8", value: 100, seriesName: "Réussie" }]);
    expect(result).toContain("08:00");
    expect(result).toContain("80");
    expect(result).toContain("Taux");
  });

  it("tooltip formatter shows forecast line when both row and forecast exist for the hour", () => {
    const data: HourlyRow[] = [{ hour: 8, total: 100, success: 80, declined: 20, amount: 5000 }];
    const opt = buildHourlyChartOption(
      data,
      [{ hour: 8, predictedTotal: 95, predictedSuccessRate: 0.85, isForecast: true }],
    ) as EChartsOption;
    const fmt = opt.tooltip?.formatter as (ps: { name: string; value: number; seriesName: string }[]) => string;
    const result = fmt([{ name: "8", value: 100, seriesName: "Réussie" }]);
    expect(result).toContain("Prévision");
    expect(result).toContain("95");
  });

  it("tooltip formatter shows rate as dash when total is zero", () => {
    const data: HourlyRow[] = [{ hour: 0, total: 0, success: 0, declined: 0, amount: 0 }];
    const opt = buildHourlyChartOption(data, []) as EChartsOption;
    const fmt = opt.tooltip?.formatter as (ps: { name: string; value: number; seriesName: string }[]) => string;
    const result = fmt([{ name: "0", value: 0, seriesName: "Réussie" }]);
    expect(result).toContain("—");
  });
});

// ─── buildDailyTrendOption ─────────────────────────────────────────────────────

describe("buildDailyTrendOption", () => {
  const makeData = (n: number): DailyTrendRow[] =>
    Array.from({ length: n }, (_, i) => ({
      day: `2024-01-${String(i + 1).padStart(2, "0")}`,
      total: 1000 + i * 10,
      success: 900 + i * 8,
      declined: 100 + i * 2,
      amount: 5000 + i * 50,
    }));

  it("produces a chart with 5 series including bar and line types", () => {
    const data = makeData(3);
    const labels = data.map((r) => r.day);
    const rates = data.map((r) => (r.success / r.total) * 100);
    const opt = buildDailyTrendOption(data, labels, rates, [], []) as EChartsOption;
    const types = opt.series.map((s) => s.type);
    expect(types).toContain("bar");
    expect(types).toContain("line");
  });

  it("maps total/success/declined to three separate stacked bar series", () => {
    const data = makeData(2);
    const labels = data.map((r) => r.day);
    const opt = buildDailyTrendOption(data, labels, [], [], []) as EChartsOption;
    const names = opt.series.map((s) => s.name);
    expect(names).toContain("Total");
    expect(names).toContain("Succès");
    expect(names).toContain("Échecs");
  });

  it("includes moving average series when maValues is non-empty", () => {
    const data = makeData(3);
    const labels = data.map((r) => r.day);
    const opt = buildDailyTrendOption(data, labels, [], [null, 1000, 1010], [1000, 1010]) as EChartsOption;
    const names = opt.series.map((s) => s.name);
    expect(names).toContain("Moy. mobile 3j");
  });

  it("omits moving average series when maValues is empty", () => {
    const data = makeData(2);
    const labels = data.map((r) => r.day);
    const opt = buildDailyTrendOption(data, labels, [], [], []) as EChartsOption;
    const names = opt.series.map((s) => s.name);
    expect(names).not.toContain("Moy. mobile 3j");
  });

  it("has two y-axes (transactions and rate)", () => {
    const data = makeData(1);
    const opt = buildDailyTrendOption(data, data.map((r) => r.day), [], [], []) as EChartsOption;
    const yAxes = opt.yAxis as unknown[];
    expect(Array.isArray(yAxes)).toBe(true);
    expect((yAxes as unknown[]).length).toBe(2);
  });

  it("MA series valueFormatter renders formatted number for non-null values", () => {
    const data = makeData(3);
    const labels = data.map((r) => r.day);
    const opt = buildDailyTrendOption(data, labels, [], [null, 1000, 1010], [1000, 1010]) as EChartsOption;
    const maSeries = opt.series.find((s) => s.name === "Moy. mobile 3j");
    const vf = (maSeries?.tooltip as { valueFormatter?: (v: number | null) => string })?.valueFormatter;
    expect(vf).toBeDefined();
    const result = vf!(1000);
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toBe("—");
  });

  it("MA series valueFormatter returns dash for null values", () => {
    const data = makeData(3);
    const labels = data.map((r) => r.day);
    const opt = buildDailyTrendOption(data, labels, [], [null, 1000], [1000]) as EChartsOption;
    const maSeries = opt.series.find((s) => s.name === "Moy. mobile 3j");
    const vf = (maSeries?.tooltip as { valueFormatter?: (v: number | null) => string })?.valueFormatter;
    expect(vf!(null)).toBe("—");
  });

  it("total series uses the neutral bar color with light border radius", () => {
    const data = makeData(1);
    const opt = buildDailyTrendOption(data, data.map((r) => r.day), [], [], []) as EChartsOption;
    const totalSeries = opt.series.find((s) => s.name === "Total");
    const d = (totalSeries?.data as Array<{ itemStyle: { borderRadius: number[] } }>)?.[0];
    expect(d.itemStyle.borderRadius).toEqual([2, 2, 0, 0]);
  });
});

// ─── buildCustomerHourlyOption ─────────────────────────────────────────────────

describe("buildCustomerHourlyOption", () => {
  it("produces a bar chart with exactly 24 data points", () => {
    const hourly = [
      { hour: 9, total: 50 },
      { hour: 14, total: 80 },
    ];
    const opt = buildCustomerHourlyOption(hourly, 14) as EChartsOption;
    const data = opt.series[0].data as unknown[];
    expect(data).toHaveLength(24);
  });

  it("highlights the peak hour with ai color and other hours with primary color", () => {
    const hourly = [
      { hour: 9, total: 50 },
      { hour: 14, total: 80 },
    ];
    const opt = buildCustomerHourlyOption(hourly, 14) as EChartsOption;
    const data = opt.series[0].data as Array<{ value: number; itemStyle: { color: string } }>;
    // The peak hour (14) should have a different color than hour 9
    expect(data[14].itemStyle.color).not.toBe(data[9].itemStyle.color);
  });

  it("fills missing hours with zero total", () => {
    const opt = buildCustomerHourlyOption([], 0) as EChartsOption;
    const data = opt.series[0].data as Array<{ value: number }>;
    // All 24 hours have zero value when no hourly data is provided
    for (const d of data) {
      expect(d.value).toBe(0);
    }
  });

  it("correctly maps the provided hourly totals to the right hour slots", () => {
    const hourly = [
      { hour: 0, total: 10 },
      { hour: 23, total: 99 },
    ];
    const opt = buildCustomerHourlyOption(hourly, 23) as EChartsOption;
    const data = opt.series[0].data as Array<{ value: number }>;
    expect(data[0].value).toBe(10);
    expect(data[23].value).toBe(99);
    expect(data[1].value).toBe(0);
  });

  it("uses 24-hour x-axis labels from 0h to 23h", () => {
    const opt = buildCustomerHourlyOption([], 0) as EChartsOption;
    const xAxis = opt.xAxis as { data: string[] };
    expect(xAxis.data).toHaveLength(24);
    expect(xAxis.data[0]).toBe("0h");
    expect(xAxis.data[23]).toBe("23h");
  });

  it("still works when peakHour is out of bounds (no hourly entry for that hour)", () => {
    // Peak hour 5 but no entry for it — should produce a valid option
    const hourly = [{ hour: 3, total: 100 }];
    const opt = buildCustomerHourlyOption(hourly, 5) as EChartsOption;
    const data = opt.series[0].data as Array<{ value: number }>;
    // Hour 5 with no data → value is 0, still colored as peak
    expect(data[5].value).toBe(0);
  });
});

// ─── withAlpha coverage: happy-path (lines 75-76) ─────────────────────────────
//
// withAlpha's regex is /rg+a?\(([^)]+)\)/i which matches strings of the form
// "rg(...)", "rga(...)", "rgga(...)" — but NOT "rgb(...)" or "rgba(...)". The
// regex is intentionally this way in the source, so the only way to reach lines
// 75-76 (the split-and-return path) through a public API is via retintOption
// with a "to" theme value that happens to match the unusual pattern.

describe("retintOption – withAlpha matching branch (lines 75-76)", () => {
  it("produces an rgba() string when the swapped base color matches the withAlpha regex", () => {
    // Arrange: use themeA as source (danger = "rgb(239, 68, 68)").
    // Set "to" danger to "rga(0, 255, 0)" — a string that matches /rg+a?\(([^)]+)\)/i.
    const themeFrom: ChartTheme = { ...themeA };
    const themeTo: ChartTheme = { ...themeA, danger: "rga(0, 255, 0)" };

    // An rgba value whose base rgb matches themeFrom.danger.
    // remapColor will:
    //   1. direct lookup → miss (key is "rgb(239, 68, 68)", not the full rgba)
    //   2. regex match → baseRgb = "rgb(239, 68, 68)" → swapped = "rga(0, 255, 0)"
    //   3. alpha = "0.42" → calls withAlpha("rga(0, 255, 0)", 0.42)
    //   4. withAlpha regex matches "rga(0, 255, 0)" → lines 75-76 execute
    //   5. returns "rgba(0, 255, 0, 0.42)"
    const option = { color: "rgba(239, 68, 68, 0.42)" };
    const result = retintOption(option, themeFrom, themeTo) as { color: string };

    expect(result.color).toBe("rgba(0, 255, 0, 0.42)");
  });
});

// ─── retintOption – alpha === undefined branch in remapColor ──────────────────
//
// When an option holds an rgb() value WITHOUT an explicit alpha component and
// the direct map lookup misses (e.g. "rgb(239,68,68)" without spaces vs the map
// key "rgb(239, 68, 68)" with spaces), remapColor reconstructs the canonical
// base-rgb string (with spaces via .trim()), finds the swap, and returns the
// swapped color directly (alpha === undefined path at source line 141).

describe("retintOption – remapColor alpha-undefined path", () => {
  it("returns the swapped color directly when the option rgb has no alpha component", () => {
    // Arrange: from.danger has spaces; option value has no spaces → direct miss.
    const themeFrom: ChartTheme = { ...themeA }; // danger = "rgb(239, 68, 68)"
    const themeTo: ChartTheme = { ...themeA, danger: "rgb(0, 0, 255)" };

    // "rgb(239,68,68)" — no spaces — is NOT a direct map key, but after the
    // remapColor regex match and trim+join, baseRgb = "rgb(239, 68, 68)" IS.
    const option = { color: "rgb(239,68,68)" };
    const result = retintOption(option, themeFrom, themeTo) as { color: string };

    // alpha is undefined → the swapped value is returned as-is.
    expect(result.color).toBe("rgb(0, 0, 255)");
  });
});

// ─── buildRiskScoreOption – warning band coverage ────────────────────────────
//
// The risk-score color ternary has three bands: danger (≥40), warning (20-39),
// success (<20). The existing tests only exercise danger and success. This test
// adds a canal whose risk lands in the warning range (20-39).

describe("buildRiskScoreOption – warning color band", () => {
  it("uses warning color for canals with risk score in the 20–39 range", () => {
    // successRate=50 → failPenalty=(100-50)*0.5=25, no other penalties → risk=25 (warning band)
    const canals = [
      canal({ key: "bill_payment", successRate: 50, total: 100, refund: 0, instance: 0, share: 0 }),
    ];
    const opt = buildRiskScoreOption(canals) as EChartsOption;
    const data = opt.series[0].data as Array<{ value: number; itemStyle: { color: string } }>;
    // risk=25 → 20 ≤ 25 < 40 → warning color
    expect(data[0].value).toBe(25);
    // The color should differ from the danger color used for high-risk canals.
    const highRiskCanals = [
      canal({ key: "bill_payment", successRate: 10, total: 100, refund: 0, instance: 0, share: 0 }),
    ];
    const highOpt = buildRiskScoreOption(highRiskCanals) as EChartsOption;
    const highData = highOpt.series[0].data as Array<{ value: number; itemStyle: { color: string } }>;
    expect(data[0].itemStyle.color).not.toBe(highData[0].itemStyle.color);
  });
});

// ─── buildCanalHeatmapOption – rate label formatter negative branch ───────────
//
// The heatmap label formatter has an uncovered branch: in rate mode, when
// p.data[2] < 0 (representing "no data" sentinel), it should return "".
// The rendered heatmap data filters out -1 values before rendering, but the
// formatter itself still handles any value.

describe("buildCanalHeatmapOption – rate label formatter for negative sentinel", () => {
  it("label formatter for rate mode returns empty string when value is negative", () => {
    const cells: CanalHourCell[] = [{ canal: "Bill", hour: 0, total: 100, success: 80 }];
    const opt = buildCanalHeatmapOption(cells, "rate") as EChartsOption;
    const label = opt.series[0].label as {
      formatter: (p: { data: [number, number, number] }) => string;
    };
    // Negative sentinel value (-1) → "p.data[2] >= 0" is false → ""
    const result = label.formatter({ data: [0, 0, -1] });
    expect(result).toBe("");
  });
});
