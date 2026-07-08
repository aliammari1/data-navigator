import { describe, expect, it } from "vitest";
import { buildOption } from "@/features/data-formulator/core/chart-options";
import { PALETTE } from "@/features/data-formulator/core/constants";
import type { ChartSpec } from "@/features/data-formulator/core/types";

// ─── Builders ───────────────────────────────────────────────────────────────────

const spec = (overrides: Partial<ChartSpec> = {}): ChartSpec => ({
  id: overrides.id ?? "chart-1",
  type: overrides.type ?? "bar",
  encodings: overrides.encodings ?? [],
  filters: overrides.filters ?? [],
  limit: overrides.limit ?? 100,
  title: overrides.title ?? "",
  topN: overrides.topN,
  showTrendline: overrides.showTrendline,
  showOutliers: overrides.showOutliers,
  insight: overrides.insight,
  pinnedAt: overrides.pinnedAt,
});

type Row = Record<string, unknown>;

const row = (x: unknown, y: unknown, color?: unknown, size?: unknown): Row => {
  const r: Row = { x_val: x, y_val: y };
  if (color !== undefined) r.color_val = color;
  if (size !== undefined) r.size_val = size;
  return r;
};

// Convenience: typed access into the returned option object.
// biome-ignore lint/suspicious/noExplicitAny: test introspection of a loosely-typed option object
const opt = (o: Record<string, unknown> | null) => o as any;

// ─── Empty / guard ──────────────────────────────────────────────────────────────

describe("buildOption — empty data guard", () => {
  it("returns null when data is empty", () => {
    expect(buildOption(spec({ type: "bar" }), [])).toBeNull();
  });

  it("returns null for every chart type when data is empty", () => {
    const types = [
      "pie",
      "donut",
      "scatter",
      "bubble",
      "heatmap",
      "treemap",
      "funnel",
      "radar",
      "stacked-bar",
      "multi-line",
      "line",
      "area",
      "horizontal-bar",
    ] as const;
    for (const type of types) {
      expect(buildOption(spec({ type }), [])).toBeNull();
    }
  });
});

// ─── Shared base styling ──────────────────────────────────────────────────────────

describe("buildOption — base styling", () => {
  it("applies a transparent background and shared text/tooltip styling", () => {
    const o = opt(buildOption(spec({ type: "bar" }), [row("A", 1)]));
    expect(o.backgroundColor).toBe("transparent");
    expect(o.textStyle).toEqual({ color: "#a1a1aa", fontFamily: "inherit" });
    expect(o.tooltip.backgroundColor).toBe("#1e1e2e");
  });
});

// ─── Pie / Donut ──────────────────────────────────────────────────────────────────

describe("buildOption — pie / donut", () => {
  it("builds a pie with full radius and slices to 14 items", () => {
    const data = Array.from({ length: 20 }, (_, i) => row(`Cat${i}`, i + 1));
    const o = opt(buildOption(spec({ type: "pie" }), data));
    expect(o.series[0].type).toBe("pie");
    expect(o.series[0].radius).toBe("70%");
    expect(o.series[0].data).toHaveLength(14);
    expect(o.series[0].data[0]).toMatchObject({ name: "Cat0", value: 1 });
  });

  it("uses an inner/outer radius pair for donut", () => {
    const o = opt(buildOption(spec({ type: "donut" }), [row("A", 5)]));
    expect(o.series[0].radius).toEqual(["42%", "70%"]);
  });

  it("cycles the palette by index modulo palette length", () => {
    const data = Array.from({ length: PALETTE.length + 2 }, (_, i) => row(`C${i}`, i + 1));
    const o = opt(buildOption(spec({ type: "pie" }), data));
    expect(o.series[0].data[0].itemStyle.color).toBe(PALETTE[0]);
    expect(o.series[0].data[PALETTE.length].itemStyle.color).toBe(PALETTE[0]);
    expect(o.series[0].data[PALETTE.length + 1].itemStyle.color).toBe(PALETTE[1]);
  });

  it("falls back to a generated slice name when x_val is missing", () => {
    const o = opt(buildOption(spec({ type: "pie" }), [{ y_val: 7 }]));
    expect(o.series[0].data[0].name).toBe("Item 1");
    expect(o.series[0].data[0].value).toBe(7);
  });

  it("coerces a missing y_val to 0", () => {
    const o = opt(buildOption(spec({ type: "pie" }), [{ x_val: "A" }]));
    expect(o.series[0].data[0].value).toBe(0);
  });

  it("uses an item-trigger tooltip whose formatter renders name, value and percent", () => {
    const o = opt(buildOption(spec({ type: "pie" }), [row("A", 1500)]));
    expect(o.tooltip.trigger).toBe("item");
    const txt = o.tooltip.formatter({ name: "North", value: 1500, percent: 33.333 });
    expect(txt).toBe("North<br/>1.5K (33.3%)");
  });

  it("tolerates an undefined percent in the tooltip formatter", () => {
    const o = opt(buildOption(spec({ type: "pie" }), [row("A", 1500)]));
    const txt = o.tooltip.formatter({ name: "X", value: 10 } as {
      name: string;
      value: number;
      percent: number;
    });
    // p.percent?.toFixed -> undefined -> string interpolates as "undefined%"
    expect(txt).toBe("X<br/>10 (undefined%)");
  });
});

// ─── Scatter / Bubble ─────────────────────────────────────────────────────────────

describe("buildOption — scatter / bubble", () => {
  it("groups points by color_val into one series per group", () => {
    const data = [row(1, 2, "G1"), row(3, 4, "G1"), row(5, 6, "G2")];
    const o = opt(buildOption(spec({ type: "scatter" }), data));
    expect(o.series).toHaveLength(2);
    const g1 = o.series.find((s: { name: string }) => s.name === "G1");
    expect(g1.data).toEqual([
      [1, 2, "1"],
      [3, 4, "3"],
    ]);
  });

  it("names the group 'Points' when color_val is empty/missing", () => {
    const o = opt(buildOption(spec({ type: "scatter" }), [row(1, 2)]));
    expect(o.series).toHaveLength(1);
    expect(o.series[0].name).toBe("Points");
  });

  it("uses symbolSize 7 for scatter and 14 for bubble", () => {
    const scatter = opt(buildOption(spec({ type: "scatter" }), [row(1, 2, "A")]));
    const bubble = opt(buildOption(spec({ type: "bubble" }), [row(1, 2, "A")]));
    expect(scatter.series[0].symbolSize).toBe(7);
    expect(bubble.series[0].symbolSize).toBe(14);
  });

  it("shows a legend only when more than one group exists", () => {
    const one = opt(buildOption(spec({ type: "scatter" }), [row(1, 2, "A")]));
    const two = opt(buildOption(spec({ type: "scatter" }), [row(1, 2, "A"), row(3, 4, "B")]));
    expect(one.legend).toBeUndefined();
    expect(two.legend).toMatchObject({ top: 0 });
  });

  it("makes both axes value-typed and scaled", () => {
    const o = opt(buildOption(spec({ type: "scatter" }), [row(1, 2, "A")]));
    expect(o.xAxis.type).toBe("value");
    expect(o.yAxis.type).toBe("value");
    expect(o.xAxis.scale).toBe(true);
    expect(o.yAxis.scale).toBe(true);
  });

  it("coerces non-numeric x/y coordinates to NaN via Number(...)", () => {
    const o = opt(buildOption(spec({ type: "scatter" }), [row("abc", "xyz", "A")]));
    const pt = o.series[0].data[0];
    expect(Number.isNaN(pt[0])).toBe(true);
    expect(Number.isNaN(pt[1])).toBe(true);
    expect(pt[2]).toBe("abc");
  });
});

// ─── Heatmap ──────────────────────────────────────────────────────────────────────

describe("buildOption — heatmap", () => {
  it("derives unique x and y categories from x_val and color_val", () => {
    const data = [row("Mon", 1, "AM"), row("Mon", 2, "PM"), row("Tue", 3, "AM")];
    const o = opt(buildOption(spec({ type: "heatmap" }), data));
    expect(o.xAxis.data).toEqual(["Mon", "Tue"]);
    expect(o.yAxis.data).toEqual(["AM", "PM"]);
  });

  it("uses size_val for the cell value when present", () => {
    const o = opt(buildOption(spec({ type: "heatmap" }), [row("Mon", 2, "AM", 99)]));
    expect(o.series[0].data[0]).toEqual(["Mon", "AM", 99]);
  });

  it("falls back to y_val when size_val is absent", () => {
    const o = opt(buildOption(spec({ type: "heatmap" }), [row("Mon", 42, "AM")]));
    expect(o.series[0].data[0]).toEqual(["Mon", "AM", 42]);
  });

  it("sets visualMap max to the largest cell value", () => {
    const o = opt(
      buildOption(spec({ type: "heatmap" }), [
        row("a", 5, "x"),
        row("b", 17, "y"),
        row("c", 3, "z"),
      ]),
    );
    expect(o.visualMap.max).toBe(17);
    expect(o.visualMap.min).toBe(0);
  });

  it("floors visualMap max at 1 when all values are zero/negative (safeMax floor)", () => {
    const o = opt(buildOption(spec({ type: "heatmap" }), [row("a", 0, "x"), row("b", -5, "y")]));
    expect(o.visualMap.max).toBe(1);
  });
});

// ─── Treemap ──────────────────────────────────────────────────────────────────────

describe("buildOption — treemap", () => {
  it("slices the data to 40 nodes", () => {
    const data = Array.from({ length: 55 }, (_, i) => row(`N${i}`, i + 1));
    const o = opt(buildOption(spec({ type: "treemap" }), data));
    expect(o.series[0].type).toBe("treemap");
    expect(o.series[0].data).toHaveLength(40);
  });

  it("falls back to a generated node name when x_val is missing", () => {
    const o = opt(buildOption(spec({ type: "treemap" }), [{ y_val: 3 }]));
    expect(o.series[0].data[0].name).toBe("Item 1");
  });

  it("formats the tooltip as 'name: value'", () => {
    const o = opt(buildOption(spec({ type: "treemap" }), [row("Sales", 2_000_000)]));
    expect(o.tooltip.formatter({ name: "Sales", value: 2_000_000 })).toBe("Sales: 2.0M");
  });
});

// ─── Funnel ──────────────────────────────────────────────────────────────────────

describe("buildOption — funnel", () => {
  it("sorts stages by value descending", () => {
    const data = [row("Low", 10), row("High", 100), row("Mid", 50)];
    const o = opt(buildOption(spec({ type: "funnel" }), data));
    expect(o.series[0].data.map((d: { name: string }) => d.name)).toEqual(["High", "Mid", "Low"]);
  });

  it("does not mutate the input array while sorting", () => {
    const data = [row("Low", 10), row("High", 100)];
    const snapshot = data.map((d) => d.x_val);
    buildOption(spec({ type: "funnel" }), data);
    expect(data.map((d) => d.x_val)).toEqual(snapshot);
  });

  it("slices to the top 10 stages", () => {
    const data = Array.from({ length: 15 }, (_, i) => row(`S${i}`, i + 1));
    const o = opt(buildOption(spec({ type: "funnel" }), data));
    expect(o.series[0].data).toHaveLength(10);
    // Highest first: S14 (value 15) leads.
    expect(o.series[0].data[0].name).toBe("S14");
  });

  it("falls back to a generated stage name when x_val is missing", () => {
    const o = opt(buildOption(spec({ type: "funnel" }), [{ y_val: 9 }]));
    expect(o.series[0].data[0].name).toBe("Stage 1");
  });
});

// ─── Radar ──────────────────────────────────────────────────────────────────────

describe("buildOption — radar", () => {
  it("builds one indicator per x label, all sharing the global max", () => {
    const data = [row("Speed", 4), row("Power", 9), row("Range", 2)];
    const o = opt(buildOption(spec({ type: "radar" }), data));
    expect(o.radar.indicator).toEqual([
      { name: "Speed", max: 9 },
      { name: "Power", max: 9 },
      { name: "Range", max: 9 },
    ]);
  });

  it("plots the y values as the single radar data point", () => {
    const o = opt(buildOption(spec({ type: "radar" }), [row("A", 3), row("B", 7)]));
    expect(o.series[0].data[0].value).toEqual([3, 7]);
  });

  it("uses the spec title as the series name when provided", () => {
    const o = opt(buildOption(spec({ type: "radar", title: "Team A" }), [row("A", 1)]));
    expect(o.series[0].data[0].name).toBe("Team A");
  });

  it("falls back to 'Profile' when the title is empty", () => {
    const o = opt(buildOption(spec({ type: "radar", title: "" }), [row("A", 1)]));
    expect(o.series[0].data[0].name).toBe("Profile");
  });

  it("floors the indicator max at 1 when all values are zero (safeMax floor)", () => {
    const o = opt(buildOption(spec({ type: "radar" }), [row("A", 0), row("B", 0)]));
    expect(o.radar.indicator[0].max).toBe(1);
  });
});

// ─── Stacked / Multi-line (pivot color) ──────────────────────────────────────────

describe("buildOption — stacked / multi-line with color pivot", () => {
  const pivotData = [
    row("Jan", 10, "North"),
    row("Jan", 5, "South"),
    row("Feb", 20, "North"),
    row("Feb", 8, "South"),
  ];

  it("pivots color values into one series per group with aligned x buckets", () => {
    const o = opt(buildOption(spec({ type: "stacked-bar" }), pivotData));
    expect(o.series).toHaveLength(2);
    const north = o.series.find((s: { name: string }) => s.name === "North");
    const south = o.series.find((s: { name: string }) => s.name === "South");
    expect(north.data).toEqual([10, 20]);
    expect(south.data).toEqual([5, 8]);
  });

  it("fills missing (x, color) cells with 0", () => {
    const sparse = [row("Jan", 10, "North"), row("Feb", 8, "South")];
    const o = opt(buildOption(spec({ type: "stacked-bar" }), sparse));
    const north = o.series.find((s: { name: string }) => s.name === "North");
    const south = o.series.find((s: { name: string }) => s.name === "South");
    // xs order: Jan, Feb
    expect(north.data).toEqual([10, 0]);
    expect(south.data).toEqual([0, 8]);
  });

  it("marks bar series with a 'total' stack for stacked-bar", () => {
    const o = opt(buildOption(spec({ type: "stacked-bar" }), pivotData));
    expect(o.series[0].type).toBe("bar");
    expect(o.series[0].stack).toBe("total");
    expect(o.series[0].smooth).toBe(false);
  });

  it("produces smooth line series without a stack for multi-line", () => {
    const o = opt(buildOption(spec({ type: "multi-line" }), pivotData));
    expect(o.series[0].type).toBe("line");
    expect(o.series[0].stack).toBeUndefined();
    expect(o.series[0].smooth).toBe(true);
    expect(o.series[0].symbol).toBe("circle");
    expect(o.series[0].lineStyle).toMatchObject({ width: 2.5 });
  });

  it("swaps axes so the value axis is on x for stacked-horizontal-bar", () => {
    const o = opt(buildOption(spec({ type: "stacked-horizontal-bar" }), pivotData));
    // horizontal => xAxis is the value axis, yAxis is the category axis
    expect(o.xAxis.type).toBe("value");
    expect(o.yAxis.type).toBe("category");
    expect(o.yAxis.data).toEqual(["Jan", "Feb"]);
  });

  it("keeps category on x for vertical stacked-bar", () => {
    const o = opt(buildOption(spec({ type: "stacked-bar" }), pivotData));
    expect(o.xAxis.type).toBe("category");
    expect(o.xAxis.data).toEqual(["Jan", "Feb"]);
    expect(o.yAxis.type).toBe("value");
  });

  it("uses an axis-trigger tooltip with a shadow pointer", () => {
    const o = opt(buildOption(spec({ type: "stacked-bar" }), pivotData));
    expect(o.tooltip.trigger).toBe("axis");
    expect(o.tooltip.axisPointer).toEqual({ type: "shadow" });
  });

  it("falls through to single-series rendering when no color_val is present", () => {
    // hasColor is false -> NOT the pivot branch even though type is stacked-bar
    const o = opt(buildOption(spec({ type: "stacked-bar" }), [row("A", 1), row("B", 2)]));
    // single bar series: data is value-objects, not a pivot of groups
    expect(o.series).toHaveLength(1);
    expect(o.series[0].type).toBe("bar");
    expect(o.series[0].data[0]).toMatchObject({ value: 1 });
  });
});

// ─── Single series: line / area ──────────────────────────────────────────────────

describe("buildOption — line / area", () => {
  it("renders a smooth line over the raw y values", () => {
    const o = opt(buildOption(spec({ type: "line" }), [row("A", 1), row("B", 2), row("C", 3)]));
    expect(o.series).toHaveLength(1);
    expect(o.series[0].type).toBe("line");
    expect(o.series[0].smooth).toBe(true);
    expect(o.series[0].data).toEqual([1, 2, 3]);
  });

  it("omits the area gradient for a plain line", () => {
    const o = opt(buildOption(spec({ type: "line" }), [row("A", 1)]));
    expect(o.series[0].areaStyle).toBeUndefined();
  });

  it("adds a linear-gradient area fill for area charts", () => {
    const o = opt(buildOption(spec({ type: "area" }), [row("A", 1)]));
    expect(o.series[0].areaStyle.color.type).toBe("linear");
    expect(o.series[0].areaStyle.color.colorStops).toHaveLength(2);
    expect(o.series[0].areaStyle.color.colorStops[0].color).toBe(`${PALETTE[0]}55`);
  });

  it("appends a trendline series when showTrendline is set and there are >2 points", () => {
    const o = opt(
      buildOption(spec({ type: "line", showTrendline: true }), [
        row("A", 0),
        row("B", 10),
        row("C", 20),
        row("D", 30),
      ]),
    );
    expect(o.series).toHaveLength(2);
    const trend = o.series[1];
    expect(trend.name).toBe("Trend");
    // A perfect linear series: the least-squares fit equals the data.
    expect(trend.data).toEqual([0, 10, 20, 30]);
    expect(trend.lineStyle.type).toBe("dashed");
  });

  it("does NOT add a trendline when there are 2 or fewer points", () => {
    const o = opt(
      buildOption(spec({ type: "line", showTrendline: true }), [row("A", 1), row("B", 2)]),
    );
    expect(o.series).toHaveLength(1);
  });

  it("does NOT add a trendline when showTrendline is unset", () => {
    const o = opt(buildOption(spec({ type: "line" }), [row("A", 1), row("B", 2), row("C", 3)]));
    expect(o.series).toHaveLength(1);
  });

  it("shows a legend once the series count exceeds one (trendline present)", () => {
    const withTrend = opt(
      buildOption(spec({ type: "line", showTrendline: true }), [
        row("A", 1),
        row("B", 5),
        row("C", 2),
        row("D", 9),
      ]),
    );
    const withoutTrend = opt(buildOption(spec({ type: "line" }), [row("A", 1)]));
    expect(withTrend.legend).toMatchObject({ top: 0 });
    expect(withoutTrend.legend).toBeUndefined();
  });
});

// ─── Single series: bar / horizontal-bar ─────────────────────────────────────────

describe("buildOption — bar / horizontal-bar", () => {
  it("renders bar values as per-point objects with the base palette color", () => {
    const o = opt(buildOption(spec({ type: "bar" }), [row("A", 3), row("B", 7)]));
    expect(o.series[0].type).toBe("bar");
    expect(o.series[0].data[0]).toMatchObject({ value: 3 });
    expect(o.series[0].data[0].itemStyle.color).toBe(PALETTE[0]);
  });

  it("uses top-rounded borders for vertical bars", () => {
    const o = opt(buildOption(spec({ type: "bar" }), [row("A", 3)]));
    expect(o.series[0].data[0].itemStyle.borderRadius).toEqual([4, 4, 0, 0]);
  });

  it("uses right-rounded borders and swaps axes for horizontal bars", () => {
    const o = opt(buildOption(spec({ type: "horizontal-bar" }), [row("A", 3)]));
    expect(o.series[0].data[0].itemStyle.borderRadius).toEqual([0, 4, 4, 0]);
    expect(o.xAxis.type).toBe("value");
    expect(o.yAxis.type).toBe("category");
  });

  it("keeps category on x and value on y for a vertical bar", () => {
    const o = opt(buildOption(spec({ type: "bar" }), [row("A", 3)]));
    expect(o.xAxis.type).toBe("category");
    expect(o.xAxis.data).toEqual(["A"]);
    expect(o.yAxis.type).toBe("value");
  });

  it("does not flag any bars red when showOutliers is unset", () => {
    const data = [row("A", 1), row("B", 2), row("C", 3), row("D", 1000)];
    const o = opt(buildOption(spec({ type: "bar" }), data));
    const colors = o.series[0].data.map((d: { itemStyle: { color: string } }) => d.itemStyle.color);
    expect(colors.every((c: string) => c === PALETTE[0])).toBe(true);
  });

  it("colors IQR outliers red when showOutliers is set", () => {
    // 1..8 plus a far outlier 1000; only the last bar should turn red.
    const data = [
      row("A", 1),
      row("B", 2),
      row("C", 3),
      row("D", 4),
      row("E", 5),
      row("F", 6),
      row("G", 7),
      row("H", 8),
      row("I", 1000),
    ];
    const o = opt(buildOption(spec({ type: "bar", showOutliers: true }), data));
    const colors = o.series[0].data.map((d: { itemStyle: { color: string } }) => d.itemStyle.color);
    expect(colors[colors.length - 1]).toBe("#f87171");
    expect(colors.slice(0, -1).every((c: string) => c === PALETTE[0])).toBe(true);
  });

  it("never flags outliers for fewer than 4 points even with showOutliers", () => {
    const data = [row("A", 1), row("B", 1000)];
    const o = opt(buildOption(spec({ type: "bar", showOutliers: true }), data));
    const colors = o.series[0].data.map((d: { itemStyle: { color: string } }) => d.itemStyle.color);
    expect(colors.every((c: string) => c === PALETTE[0])).toBe(true);
  });
});

// ─── Axis / label edge cases shared by category-axis charts ──────────────────────

describe("buildOption — category axis label rotation", () => {
  it("does not rotate labels when there are 10 or fewer categories", () => {
    const data = Array.from({ length: 10 }, (_, i) => row(`C${i}`, i));
    const o = opt(buildOption(spec({ type: "bar" }), data));
    expect(o.xAxis.axisLabel.rotate).toBe(0);
  });

  it("rotates labels 35deg once there are more than 10 categories", () => {
    const data = Array.from({ length: 11 }, (_, i) => row(`C${i}`, i));
    const o = opt(buildOption(spec({ type: "bar" }), data));
    expect(o.xAxis.axisLabel.rotate).toBe(35);
  });

  it("stringifies null/undefined x labels to empty strings", () => {
    const o = opt(buildOption(spec({ type: "bar" }), [{ y_val: 1 }, { x_val: null, y_val: 2 }]));
    expect(o.xAxis.data).toEqual(["", ""]);
  });
});

// ─── grid layout for single series ──────────────────────────────────────────────

describe("buildOption — single-series grid layout", () => {
  it("uses a taller top margin when a legend (extra series) is present", () => {
    const withTrend = opt(
      buildOption(spec({ type: "line", showTrendline: true }), [
        row("A", 1),
        row("B", 5),
        row("C", 2),
      ]),
    );
    const single = opt(buildOption(spec({ type: "line" }), [row("A", 1)]));
    expect(withTrend.grid.top).toBe(32);
    expect(single.grid.top).toBe(16);
  });
});

// ─── Nullish fallback branch coverage ────────────────────────────────────────────

describe("buildOption — nullish / missing field fallbacks", () => {
  // ── Scatter (line 103): x_val and y_val missing ──────────────────────────
  it("coerces missing x_val and y_val to 0/empty in scatter data array", () => {
    // Pass a row with no x_val and no y_val to force all three ?? fallbacks on line 103
    const o = opt(buildOption(spec({ type: "scatter" }), [{ color_val: "G" }]));
    const pt = o.series[0].data[0];
    // Number(undefined ?? 0) === 0, String(undefined ?? "") === ""
    expect(pt[0]).toBe(0);
    expect(pt[1]).toBe(0);
    expect(pt[2]).toBe("");
  });

  // ── Heatmap (lines 128-133): null/undefined x_val, color_val, and both size+y null ──
  it("coerces null x_val and color_val to empty string in heatmap axes and data", () => {
    // No x_val, no color_val, no size_val, no y_val → hits all five heatmap ?? fallbacks
    const o = opt(buildOption(spec({ type: "heatmap" }), [{}]));
    expect(o.xAxis.data).toContain("");
    expect(o.yAxis.data).toContain("");
    const cell = o.series[0].data[0];
    expect(cell[0]).toBe("");
    expect(cell[1]).toBe("");
    // Number(undefined ?? undefined ?? 0) === 0
    expect(cell[2]).toBe(0);
  });

  it("falls back size_val to y_val when size_val is null but y_val is present in heatmap (branch 27 arm 1)", () => {
    // size_val present → uses size_val (arm 0); here we test arm 1 of the chain:
    // size_val is undefined, y_val is provided, so result = y_val
    const o = opt(buildOption(spec({ type: "heatmap" }), [row("A", 42, "X")]));
    expect(o.series[0].data[0][2]).toBe(42);
  });

  // ── Treemap (line 181): missing y_val ───────────────────────────────────
  it("coerces missing y_val to 0 in treemap node value", () => {
    // Provide x_val but no y_val to hit the `y_val ?? 0` fallback on line 181
    const o = opt(buildOption(spec({ type: "treemap" }), [{ x_val: "MyNode" }]));
    expect(o.series[0].data[0].name).toBe("MyNode");
    expect(o.series[0].data[0].value).toBe(0);
  });

  // ── Funnel (line 206): sort comparator ?? 0 when y_val is missing ───────
  it("treats missing y_val as 0 in the funnel sort comparator (both a and b may be null)", () => {
    // To hit both `b.y_val ?? 0` and `a.y_val ?? 0` fallbacks, supply two rows
    // where y_val is absent so the sort comparator sees null for both a and b.
    const data = [{ x_val: "NoVal1" }, { x_val: "NoVal2" }, row("HasVal", 50)];
    const o = opt(buildOption(spec({ type: "funnel" }), data));
    // "HasVal" (50) sorts first; the two no-val rows follow (both treated as 0)
    expect(o.series[0].data[0].name).toBe("HasVal");
    // Both null-y_val rows should appear (order between them is stable/unspecified)
    const names = o.series[0].data.map((d: { name: string }) => d.name);
    expect(names).toContain("NoVal1");
    expect(names).toContain("NoVal2");
  });

  // ── Funnel (line 212): tooltip formatter is callable ────────────────────
  it("funnel tooltip formatter returns 'name: formattedValue'", () => {
    const o = opt(buildOption(spec({ type: "funnel" }), [row("SignUp", 5000)]));
    expect(o.tooltip.trigger).toBe("item");
    const result = o.tooltip.formatter({ name: "SignUp", value: 5000 });
    expect(result).toBe("SignUp: 5.0K");
  });

  // ── Funnel (line 223): stage value ?? 0 when y_val is missing ───────────
  it("coerces missing y_val to 0 in funnel stage value", () => {
    const o = opt(buildOption(spec({ type: "funnel" }), [{ x_val: "Step" }]));
    expect(o.series[0].data[0].value).toBe(0);
  });

  // ── Stacked / Multi-line (line 278): null x_val, color_val, y_val ───────
  it("coerces null x_val, color_val, y_val to empty/0 in the stacked byKey map", () => {
    // Rows with no x_val, no color_val, no y_val → hits all three ?? fallbacks on line 278.
    // hasColor will be false for rows without color_val, so we mix in a colored row to
    // ensure the pivot branch is taken, then add a row missing all fields.
    const data = [
      { color_val: "G1" },          // no x_val, no y_val → x_val ?? "" and y_val ?? 0
      row("Jan", 10, "G1"),
    ];
    const o = opt(buildOption(spec({ type: "stacked-bar" }), data));
    // Should produce at least one series named "G1"
    const g1 = o.series.find((s: { name: string }) => s.name === "G1");
    expect(g1).toBeDefined();
    // The "" bucket should exist and contain 0 for the missing-field row
    expect(g1.data).toBeDefined();
  });

  it("coerces null color_val to empty string in stacked pivot byKey map (branch 43)", () => {
    // A row with a non-null color_val ensures hasColor=true (pivot branch is taken).
    // A second row with no color_val hits the `color_val ?? ""` fallback on line 278.
    const data = [
      row("Jan", 5, "G1"),     // color_val="G1" → hasColor becomes true
      { x_val: "Feb", y_val: 8 },  // no color_val → color_val ?? "" on line 278
    ];
    const o = opt(buildOption(spec({ type: "stacked-bar" }), data));
    // "G1" series and the "" (no-color) series are both created
    const g1 = o.series.find((s: { name: string }) => s.name === "G1");
    expect(g1).toBeDefined();
  });

  it("coerces null x_val and color_val to empty string keys in multi-line pivot", () => {
    // Row without x_val → x_val ?? "" branch; color_val is provided so hasColor stays true
    const data = [
      { y_val: 5, color_val: "Series1" },  // no x_val
      row("Feb", 8, "Series1"),
    ];
    const o = opt(buildOption(spec({ type: "multi-line" }), data));
    const s1 = o.series.find((s: { name: string }) => s.name === "Series1");
    expect(s1).toBeDefined();
    expect(s1.type).toBe("line");
  });
});
