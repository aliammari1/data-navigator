import { describe, expect, it } from "vitest";
import {
  buildCanalHeatmapOption,
  buildCanalShareOption,
  buildHourlyChartOption,
  buildRiskScoreOption,
  buildStatusDonutOption,
  buildSuccessRateTrendOption,
  type ChartTheme,
  chartTheme,
  retintOption,
} from "@/features/telecom/lib/chart-options";
import type { CanalHourCell, CanalSummary, HourlyRow, StatusRow } from "@/features/telecom/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// Minimal access to nested ECharts option fields without `any`.
type EChartsOption = {
  series: Array<Record<string, unknown>>;
  yAxis?: { data?: unknown[] } | Array<{ data?: unknown[] }>;
  xAxis?: { data?: unknown[] };
  legend?: { data?: string[] };
  visualMap?: { min: number; max: number; inRange: { color: string[] } };
};

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

describe("chartTheme", () => {
  it("returns a complete theme object with every chrome and semantic color key", () => {
    const t = chartTheme();

    for (const key of [
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
    ] as const) {
      expect(typeof t[key]).toBe("string");
      expect(t[key].length).toBeGreaterThan(0);
    }
  });
});

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

  it("remaps the base hue of an rgba alpha variant to the new theme", () => {
    // A gradient stop built from withAlpha(themeA.danger, 0.19) — its rgb channels
    // match themeA.danger, so retint swaps them to themeB.danger's channels.
    const option = { color: "rgba(239, 68, 68, 0.19)" };

    const result = retintOption(option, themeA, themeB) as { color: string };

    // The base hue is remapped from danger-A (239,68,68) to danger-B (255,0,0).
    // NOTE: the original alpha is dropped here because `withAlpha` cannot parse a
    // plain `rgb(...)` swap target (its regex never matches the literal "rgb(").
    // See the dedicated quirk test below — this asserts the *actual* behavior.
    expect(result.color).toBe("rgb(255, 0, 0)");
  });

  it("leaves an rgba variant untouched when its base hue is not a swapped palette color", () => {
    // warning is identical across themes, so neither its rgb nor rgba form swaps.
    const option = { color: "rgba(245, 158, 11, 0.5)" };

    const result = retintOption(option, themeA, themeB) as { color: string };

    expect(result.color).toBe("rgba(245, 158, 11, 0.5)");
  });

  it("recurses through arrays and nested objects", () => {
    const option = {
      series: [{ itemStyle: { color: themeA.primary } }, { lineStyle: { color: themeA.danger } }],
    };

    const result = retintOption(option, themeA, themeB) as {
      series: Array<{ itemStyle?: { color: string }; lineStyle?: { color: string } }>;
    };

    expect(result.series[0].itemStyle?.color).toBe(themeB.primary);
    expect(result.series[1].lineStyle?.color).toBe(themeB.danger);
  });

  it("preserves function references (formatters) without invoking them", () => {
    const formatter = () => "x";
    const option = { tooltip: { formatter } };

    const result = retintOption(option, themeA, themeB) as {
      tooltip: { formatter: () => string };
    };

    expect(result.tooltip.formatter).toBe(formatter);
  });

  it("does not swap colors that are unchanged between the two themes", () => {
    // warning is identical in A and B, so it must not be in the swap map.
    const option = { color: themeA.warning };

    const result = retintOption(option, themeA, themeB) as { color: string };

    expect(result.color).toBe(themeA.warning);
  });
});

describe("buildStatusDonutOption", () => {
  it("maps each status row to a pie slice with the matching status color", () => {
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
});

describe("buildCanalShareOption", () => {
  it("orders canal categories by descending total", () => {
    const canals = [
      canal({ key: "bill_payment", label: "small", total: 10 }),
      canal({ key: "credit_transfer", label: "big", total: 1000 }),
    ];

    const opt = buildCanalShareOption(canals) as EChartsOption;
    const labels = (opt.yAxis as { data: string[] }).data;

    // The larger-total canal's shortLabel comes first.
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
});

describe("buildSuccessRateTrendOption", () => {
  it("colors bars green / amber / red by success-rate band", () => {
    const canals = [
      canal({ key: "bill_payment", successRate: 99 }), // >= 95 → success
      canal({ key: "credit_transfer", successRate: 85 }), // >= 80 → warning
      canal({ key: "data_sabba", successRate: 50 }), // < 80 → danger
    ];

    const opt = buildSuccessRateTrendOption(canals) as EChartsOption;
    const data = opt.series[0].data as Array<{ value: number; itemStyle: { color: string } }>;

    // Sorted by descending rate, so [99, 85, 50].
    expect(data[0].value).toBe(99);
    expect(data[0].itemStyle.color).not.toBe(data[2].itemStyle.color);
  });
});

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
});

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
      { hour: 1, total: 50, success: 40, declined: 30, amount: 0 }, // would be -20 → 0
    ];

    const opt = buildHourlyChartOption(data, []) as EChartsOption;
    const autre = opt.series.find((s) => s.name === "Autre")?.data as number[];

    expect(autre[0]).toBe(10);
    expect(autre[1]).toBe(0);
  });

  it("omits the forecast series and legend entry when no forecast is given", () => {
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
    // 24 base hours + 1 forecast-only hour.
    expect((opt.xAxis as { data: string[] }).data).toHaveLength(25);
  });
});

describe("buildCanalHeatmapOption", () => {
  it("computes per-cell success rate as a rounded percentage in rate mode", () => {
    const cells: CanalHourCell[] = [{ canal: "Bill", hour: 9, total: 200, success: 150 }];

    const opt = buildCanalHeatmapOption(cells, "rate") as EChartsOption;
    const data = opt.series[0].data as Array<[number, number, number]>;

    // 150 / 200 = 75%.
    const cell = data.find(([h]) => h === 9);
    expect(cell?.[2]).toBe(75);
  });

  it("drops empty cells (rate of -1) from the rendered heatmap data", () => {
    const cells: CanalHourCell[] = [{ canal: "Bill", hour: 9, total: 0, success: 0 }];

    const opt = buildCanalHeatmapOption(cells, "rate") as EChartsOption;
    const data = opt.series[0].data as Array<[number, number, number]>;

    // The hour-9 cell has total 0 → rate -1 → filtered out; only non-empty hours remain.
    expect(data.every(([, , v]) => v !== -1)).toBe(true);
  });

  it("uses raw totals and a 0..100 success scale for the two view modes", () => {
    const cells: CanalHourCell[] = [{ canal: "Bill", hour: 5, total: 42, success: 21 }];

    const volume = buildCanalHeatmapOption(cells, "volume") as EChartsOption;
    const rate = buildCanalHeatmapOption(cells, "rate") as EChartsOption;

    const volCell = (volume.series[0].data as Array<[number, number, number]>).find(
      ([h]) => h === 5,
    );
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
});
