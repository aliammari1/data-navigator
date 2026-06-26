import { describe, expect, it } from "vitest";

import {
  DENSE_SERIES_FLAGS,
  buildBarOption,
  buildHeatmapOption,
  buildLineOption,
  buildPieOption,
  buildScatterOption,
} from "@/platform/viz/chart-options";

// ---------------------------------------------------------------------------
// DENSE_SERIES_FLAGS constant
// ---------------------------------------------------------------------------

describe("DENSE_SERIES_FLAGS", () => {
  it("exports the expected perf flags shape", () => {
    expect(DENSE_SERIES_FLAGS).toEqual({
      large: true,
      largeThreshold: 2000,
      sampling: "lttb",
      progressive: 4000,
      progressiveThreshold: 5000,
      showSymbol: false,
      animation: false,
    });
  });

  it("sampling is exactly the string literal 'lttb'", () => {
    expect(DENSE_SERIES_FLAGS.sampling).toBe("lttb");
  });
});

// ---------------------------------------------------------------------------
// buildLineOption
// ---------------------------------------------------------------------------

describe("buildLineOption", () => {
  const categories = ["Jan", "Feb", "Mar"];
  const singleSeries = [{ name: "Revenue", data: [100, 200, 300] as number[] }];
  const multiSeries = [
    { name: "Revenue", data: [100, 200, 300] as number[] },
    { name: "Cost", data: [50, 80, 120] as number[] },
  ];

  it("returns a valid EChartsOption structure with defaults (no opts)", () => {
    const option = buildLineOption(categories, singleSeries);
    expect(option).toBeDefined();
    expect(option.tooltip).toEqual({ trigger: "axis" });
    expect(option.xAxis).toBeDefined();
    expect(option.yAxis).toEqual({ type: "value" });
  });

  it("omits title when opts.title is not provided (falsy branch)", () => {
    const option = buildLineOption(categories, singleSeries);
    expect(option.title).toBeUndefined();
  });

  it("includes title when opts.title is provided (truthy branch)", () => {
    const option = buildLineOption(categories, singleSeries, { title: "My Chart" });
    expect(option.title).toEqual({ text: "My Chart" });
  });

  it("sets grid top to 32 when no title", () => {
    const option = buildLineOption(categories, singleSeries);
    expect((option.grid as { top: number }).top).toBe(32);
  });

  it("sets grid top to 56 when title is present", () => {
    const option = buildLineOption(categories, singleSeries, { title: "T" });
    expect((option.grid as { top: number }).top).toBe(56);
  });

  it("omits legend when only one series (falsy branch)", () => {
    const option = buildLineOption(categories, singleSeries);
    expect(option.legend).toBeUndefined();
  });

  it("includes legend when more than one series (truthy branch)", () => {
    const option = buildLineOption(categories, multiSeries);
    const legend = option.legend as { data: string[] };
    expect(legend).toBeDefined();
    expect(legend.data).toEqual(["Revenue", "Cost"]);
  });

  it("maps categories to strings for xAxis.data", () => {
    const numericCategories = [1, 2, 3];
    const option = buildLineOption(numericCategories, singleSeries);
    const xAxis = option.xAxis as { type: string; data: string[] };
    expect(xAxis.data).toEqual(["1", "2", "3"]);
    expect(xAxis.boundaryGap).toBe(false);
  });

  it("applies DENSE_SERIES_FLAGS to each series item", () => {
    const option = buildLineOption(categories, singleSeries);
    const seriesArr = option.series as Array<Record<string, unknown>>;
    expect(seriesArr[0].large).toBe(true);
    expect(seriesArr[0].largeThreshold).toBe(2000);
    expect(seriesArr[0].sampling).toBe("lttb");
    expect(seriesArr[0].progressive).toBe(4000);
    expect(seriesArr[0].progressiveThreshold).toBe(5000);
    expect(seriesArr[0].showSymbol).toBe(false);
    expect(seriesArr[0].animation).toBe(false);
  });

  it("omits itemStyle when series has no color (falsy branch)", () => {
    const option = buildLineOption(categories, singleSeries);
    const seriesArr = option.series as Array<Record<string, unknown>>;
    expect(seriesArr[0].itemStyle).toBeUndefined();
  });

  it("includes itemStyle color when series color is specified (truthy branch)", () => {
    const coloredSeries = [{ name: "Revenue", data: [100, 200] as number[], color: "#ff0000" }];
    const option = buildLineOption(categories, coloredSeries);
    const seriesArr = option.series as Array<{ itemStyle?: { color: string } }>;
    expect(seriesArr[0].itemStyle).toEqual({ color: "#ff0000" });
  });

  it("sets series type to 'line' for all series", () => {
    const option = buildLineOption(categories, multiSeries);
    const seriesArr = option.series as Array<{ type: string }>;
    expect(seriesArr[0].type).toBe("line");
    expect(seriesArr[1].type).toBe("line");
  });

  it("handles mixed color and no-color series", () => {
    const mixed = [
      { name: "A", data: [1, 2, 3] as number[], color: "#abc" },
      { name: "B", data: [4, 5, 6] as number[] },
    ];
    const option = buildLineOption(categories, mixed);
    const seriesArr = option.series as Array<{ itemStyle?: { color: string } }>;
    expect(seriesArr[0].itemStyle).toEqual({ color: "#abc" });
    expect(seriesArr[1].itemStyle).toBeUndefined();
  });

  it("accepts dark option without error", () => {
    const option = buildLineOption(categories, singleSeries, { dark: true });
    expect(option).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// buildBarOption
// ---------------------------------------------------------------------------

describe("buildBarOption", () => {
  const categories = ["Q1", "Q2", "Q3"];
  const singleSeries = [{ name: "Sales", data: [10, 20, 30] as number[] }];
  const multiSeries = [
    { name: "Sales", data: [10, 20, 30] as number[] },
    { name: "Returns", data: [1, 2, 3] as number[] },
  ];

  it("returns a valid EChartsOption structure with defaults", () => {
    const option = buildBarOption(categories, singleSeries);
    expect(option).toBeDefined();
    expect(option.tooltip).toEqual({ trigger: "axis", axisPointer: { type: "shadow" } });
  });

  it("omits title when opts.title is not provided (falsy branch)", () => {
    const option = buildBarOption(categories, singleSeries);
    expect(option.title).toBeUndefined();
  });

  it("includes title when opts.title is provided (truthy branch)", () => {
    const option = buildBarOption(categories, singleSeries, { title: "Bar Chart" });
    expect(option.title).toEqual({ text: "Bar Chart" });
  });

  it("sets grid top to 32 when no title", () => {
    const option = buildBarOption(categories, singleSeries);
    expect((option.grid as { top: number }).top).toBe(32);
  });

  it("sets grid top to 56 when title is present", () => {
    const option = buildBarOption(categories, singleSeries, { title: "T" });
    expect((option.grid as { top: number }).top).toBe(56);
  });

  it("omits legend when only one series (falsy branch)", () => {
    const option = buildBarOption(categories, singleSeries);
    expect(option.legend).toBeUndefined();
  });

  it("includes legend when more than one series (truthy branch)", () => {
    const option = buildBarOption(categories, multiSeries);
    const legend = option.legend as { data: string[] };
    expect(legend).toBeDefined();
    expect(legend.data).toEqual(["Sales", "Returns"]);
  });

  it("uses vertical orientation (category x, value y) by default (horizontal=falsy)", () => {
    const option = buildBarOption(categories, singleSeries);
    const xAxis = option.xAxis as { type: string };
    const yAxis = option.yAxis as { type: string };
    expect(xAxis.type).toBe("category");
    expect(yAxis.type).toBe("value");
  });

  it("uses horizontal orientation (value x, category y) when opts.horizontal=true (truthy branch)", () => {
    const option = buildBarOption(categories, singleSeries, { horizontal: true });
    const xAxis = option.xAxis as { type: string };
    const yAxis = option.yAxis as { type: string };
    expect(xAxis.type).toBe("value");
    expect(yAxis.type).toBe("category");
  });

  it("maps categories to strings for category axis data", () => {
    const numericCats = [1, 2, 3];
    const option = buildBarOption(numericCats, singleSeries);
    const xAxis = option.xAxis as { data: string[] };
    expect(xAxis.data).toEqual(["1", "2", "3"]);
  });

  it("maps categories to strings in horizontal mode (category is on y-axis)", () => {
    const numericCats = [1, 2, 3];
    const option = buildBarOption(numericCats, singleSeries, { horizontal: true });
    const yAxis = option.yAxis as { data: string[] };
    expect(yAxis.data).toEqual(["1", "2", "3"]);
  });

  it("omits itemStyle when series has no color (falsy branch)", () => {
    const option = buildBarOption(categories, singleSeries);
    const seriesArr = option.series as Array<Record<string, unknown>>;
    expect(seriesArr[0].itemStyle).toBeUndefined();
  });

  it("includes itemStyle color when series color is specified (truthy branch)", () => {
    const coloredSeries = [{ name: "Sales", data: [10, 20, 30] as number[], color: "#00ff00" }];
    const option = buildBarOption(categories, coloredSeries);
    const seriesArr = option.series as Array<{ itemStyle?: { color: string } }>;
    expect(seriesArr[0].itemStyle).toEqual({ color: "#00ff00" });
  });

  it("sets series type to 'bar' for all series", () => {
    const option = buildBarOption(categories, multiSeries);
    const seriesArr = option.series as Array<{ type: string }>;
    expect(seriesArr[0].type).toBe("bar");
    expect(seriesArr[1].type).toBe("bar");
  });

  it("handles mixed color and no-color series", () => {
    const mixed = [
      { name: "A", data: [1, 2, 3] as number[], color: "#ccc" },
      { name: "B", data: [4, 5, 6] as number[] },
    ];
    const option = buildBarOption(categories, mixed);
    const seriesArr = option.series as Array<{ itemStyle?: { color: string } }>;
    expect(seriesArr[0].itemStyle).toEqual({ color: "#ccc" });
    expect(seriesArr[1].itemStyle).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildPieOption
// ---------------------------------------------------------------------------

describe("buildPieOption", () => {
  const data = [
    { name: "A", value: 40 },
    { name: "B", value: 30 },
    { name: "C", value: 30 },
  ];

  it("returns a valid EChartsOption structure with defaults", () => {
    const option = buildPieOption(data);
    expect(option).toBeDefined();
    expect(option.tooltip).toEqual({ trigger: "item" });
    expect(option.legend).toEqual({ bottom: 0 });
  });

  it("omits title when opts.title is not provided (falsy branch)", () => {
    const option = buildPieOption(data);
    expect(option.title).toBeUndefined();
  });

  it("includes title centered when opts.title is provided (truthy branch)", () => {
    const option = buildPieOption(data, { title: "Distribution" });
    expect(option.title).toEqual({ text: "Distribution", left: "center" });
  });

  it("uses full circle radius '65%' when donut is false/absent (falsy branch)", () => {
    const option = buildPieOption(data);
    const seriesArr = option.series as Array<{ radius: string | string[] }>;
    expect(seriesArr[0].radius).toBe("65%");
  });

  it("uses donut radius when opts.donut=true (truthy branch)", () => {
    const option = buildPieOption(data, { donut: true });
    const seriesArr = option.series as Array<{ radius: string | string[] }>;
    expect(seriesArr[0].radius).toEqual(["45%", "70%"]);
  });

  it("sets correct center position regardless of donut mode", () => {
    const pieOption = buildPieOption(data);
    const donutOption = buildPieOption(data, { donut: true });
    const pieSeries = pieOption.series as Array<{ center: string[] }>;
    const donutSeries = donutOption.series as Array<{ center: string[] }>;
    expect(pieSeries[0].center).toEqual(["50%", "48%"]);
    expect(donutSeries[0].center).toEqual(["50%", "48%"]);
  });

  it("includes emphasis itemStyle with shadow properties", () => {
    const option = buildPieOption(data);
    const seriesArr = option.series as Array<{
      emphasis: { itemStyle: { shadowBlur: number; shadowColor: string } };
    }>;
    expect(seriesArr[0].emphasis.itemStyle.shadowBlur).toBe(10);
    expect(seriesArr[0].emphasis.itemStyle.shadowColor).toBe("rgba(0,0,0,0.3)");
  });

  it("passes data through to the series", () => {
    const option = buildPieOption(data);
    const seriesArr = option.series as Array<{ data: typeof data }>;
    expect(seriesArr[0].data).toBe(data);
  });
});

// ---------------------------------------------------------------------------
// buildHeatmapOption
// ---------------------------------------------------------------------------

describe("buildHeatmapOption", () => {
  const xLabels = ["X1", "X2", "X3"];
  const yLabels = ["Y1", "Y2"];
  const cells: [number, number, number][] = [
    [0, 0, 0.5],
    [1, 0, -0.3],
    [0, 1, 0.8],
  ];

  it("returns a valid EChartsOption structure with defaults", () => {
    const option = buildHeatmapOption(xLabels, yLabels, cells);
    expect(option).toBeDefined();
    expect(option.tooltip).toEqual({ position: "top" });
  });

  it("omits title when opts.title is not provided (falsy branch)", () => {
    const option = buildHeatmapOption(xLabels, yLabels, cells);
    expect(option.title).toBeUndefined();
  });

  it("includes title when opts.title is provided (truthy branch)", () => {
    const option = buildHeatmapOption(xLabels, yLabels, cells, { title: "Correlation" });
    expect(option.title).toEqual({ text: "Correlation" });
  });

  it("sets grid top to 32 when no title", () => {
    const option = buildHeatmapOption(xLabels, yLabels, cells);
    expect((option.grid as { top: number }).top).toBe(32);
  });

  it("sets grid top to 56 when title is present", () => {
    const option = buildHeatmapOption(xLabels, yLabels, cells, { title: "T" });
    expect((option.grid as { top: number }).top).toBe(56);
  });

  it("uses default min=-1 when opts.min is not provided (nullish coalescing falsy path)", () => {
    const option = buildHeatmapOption(xLabels, yLabels, cells);
    const visualMap = option.visualMap as { min: number };
    expect(visualMap.min).toBe(-1);
  });

  it("uses default max=1 when opts.max is not provided (nullish coalescing falsy path)", () => {
    const option = buildHeatmapOption(xLabels, yLabels, cells);
    const visualMap = option.visualMap as { max: number };
    expect(visualMap.max).toBe(1);
  });

  it("uses provided min value (nullish coalescing truthy path)", () => {
    const option = buildHeatmapOption(xLabels, yLabels, cells, { min: -5 });
    const visualMap = option.visualMap as { min: number };
    expect(visualMap.min).toBe(-5);
  });

  it("uses provided max value (nullish coalescing truthy path)", () => {
    const option = buildHeatmapOption(xLabels, yLabels, cells, { max: 5 });
    const visualMap = option.visualMap as { max: number };
    expect(visualMap.max).toBe(5);
  });

  it("uses provided min=0 (nullish coalescing: 0 is NOT nullish, truthy path)", () => {
    const option = buildHeatmapOption(xLabels, yLabels, cells, { min: 0 });
    const visualMap = option.visualMap as { min: number };
    expect(visualMap.min).toBe(0);
  });

  it("uses provided max=0 (nullish coalescing: 0 is NOT nullish, truthy path)", () => {
    const option = buildHeatmapOption(xLabels, yLabels, cells, { max: 0 });
    const visualMap = option.visualMap as { max: number };
    expect(visualMap.max).toBe(0);
  });

  it("configures visualMap orientation and position", () => {
    const option = buildHeatmapOption(xLabels, yLabels, cells);
    const visualMap = option.visualMap as {
      calculable: boolean;
      orient: string;
      left: string;
      bottom: number;
    };
    expect(visualMap.calculable).toBe(true);
    expect(visualMap.orient).toBe("horizontal");
    expect(visualMap.left).toBe("center");
    expect(visualMap.bottom).toBe(8);
  });

  it("uses the correct color gradient for the visual map", () => {
    const option = buildHeatmapOption(xLabels, yLabels, cells);
    const visualMap = option.visualMap as { inRange: { color: string[] } };
    expect(visualMap.inRange.color).toEqual(["#2563eb", "#f8fafc", "#dc2626"]);
  });

  it("configures xAxis and yAxis as category type with splitArea", () => {
    const option = buildHeatmapOption(xLabels, yLabels, cells);
    const xAxis = option.xAxis as { type: string; data: string[]; splitArea: { show: boolean } };
    const yAxis = option.yAxis as { type: string; data: string[]; splitArea: { show: boolean } };
    expect(xAxis.type).toBe("category");
    expect(xAxis.data).toEqual(xLabels);
    expect(xAxis.splitArea.show).toBe(true);
    expect(yAxis.type).toBe("category");
    expect(yAxis.data).toEqual(yLabels);
    expect(yAxis.splitArea.show).toBe(true);
  });

  it("passes cells data through to the heatmap series", () => {
    const option = buildHeatmapOption(xLabels, yLabels, cells);
    const seriesArr = option.series as Array<{ type: string; data: typeof cells; label: { show: boolean } }>;
    expect(seriesArr[0].type).toBe("heatmap");
    expect(seriesArr[0].data).toBe(cells);
    expect(seriesArr[0].label.show).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildScatterOption
// ---------------------------------------------------------------------------

describe("buildScatterOption", () => {
  const clusters = [
    { name: "Cluster A", points: [[1, 2], [3, 4]] as [number, number][], color: "#ff0000" },
    { name: "Cluster B", points: [[5, 6], [7, 8]] as [number, number][] },
  ];

  it("returns a valid EChartsOption structure with defaults", () => {
    const option = buildScatterOption(clusters);
    expect(option).toBeDefined();
    expect(option.tooltip).toEqual({ trigger: "item" });
    expect(option.legend).toEqual({ bottom: 0 });
  });

  it("omits title when opts.title is not provided (falsy branch)", () => {
    const option = buildScatterOption(clusters);
    expect(option.title).toBeUndefined();
  });

  it("includes title when opts.title is provided (truthy branch)", () => {
    const option = buildScatterOption(clusters, { title: "Scatter Plot" });
    expect(option.title).toEqual({ text: "Scatter Plot" });
  });

  it("sets grid top to 32 when no title", () => {
    const option = buildScatterOption(clusters);
    expect((option.grid as { top: number }).top).toBe(32);
  });

  it("sets grid top to 56 when title is present", () => {
    const option = buildScatterOption(clusters, { title: "T" });
    expect((option.grid as { top: number }).top).toBe(56);
  });

  it("configures both axes as value type with scale=true", () => {
    const option = buildScatterOption(clusters);
    const xAxis = option.xAxis as { type: string; scale: boolean };
    const yAxis = option.yAxis as { type: string; scale: boolean };
    expect(xAxis.type).toBe("value");
    expect(xAxis.scale).toBe(true);
    expect(yAxis.type).toBe("value");
    expect(yAxis.scale).toBe(true);
  });

  it("includes itemStyle color when cluster has color defined (truthy branch)", () => {
    const option = buildScatterOption(clusters);
    const seriesArr = option.series as Array<{ itemStyle?: { color: string } }>;
    expect(seriesArr[0].itemStyle).toEqual({ color: "#ff0000" });
  });

  it("omits itemStyle when cluster has no color (falsy branch)", () => {
    const option = buildScatterOption(clusters);
    const seriesArr = option.series as Array<{ itemStyle?: { color: string } }>;
    expect(seriesArr[1].itemStyle).toBeUndefined();
  });

  it("sets symbolSize=8 and large/largeThreshold for all series", () => {
    const option = buildScatterOption(clusters);
    const seriesArr = option.series as Array<{
      symbolSize: number;
      large: boolean;
      largeThreshold: number;
    }>;
    expect(seriesArr[0].symbolSize).toBe(8);
    expect(seriesArr[0].large).toBe(true);
    expect(seriesArr[0].largeThreshold).toBe(2000);
    expect(seriesArr[1].symbolSize).toBe(8);
    expect(seriesArr[1].large).toBe(true);
    expect(seriesArr[1].largeThreshold).toBe(2000);
  });

  it("sets series type to 'scatter' for all clusters", () => {
    const option = buildScatterOption(clusters);
    const seriesArr = option.series as Array<{ type: string }>;
    expect(seriesArr[0].type).toBe("scatter");
    expect(seriesArr[1].type).toBe("scatter");
  });

  it("passes points data through to series.data", () => {
    const option = buildScatterOption(clusters);
    const seriesArr = option.series as Array<{ data: [number, number][] }>;
    expect(seriesArr[0].data).toBe(clusters[0].points);
    expect(seriesArr[1].data).toBe(clusters[1].points);
  });

  it("includes cluster names in series", () => {
    const option = buildScatterOption(clusters);
    const seriesArr = option.series as Array<{ name: string }>;
    expect(seriesArr[0].name).toBe("Cluster A");
    expect(seriesArr[1].name).toBe("Cluster B");
  });

  it("handles a single cluster with no color", () => {
    const single = [{ name: "Solo", points: [[0, 0]] as [number, number][] }];
    const option = buildScatterOption(single);
    const seriesArr = option.series as Array<{ name: string; itemStyle?: { color: string } }>;
    expect(seriesArr).toHaveLength(1);
    expect(seriesArr[0].name).toBe("Solo");
    expect(seriesArr[0].itemStyle).toBeUndefined();
  });

  it("handles empty clusters array", () => {
    const option = buildScatterOption([]);
    const seriesArr = option.series as unknown[];
    expect(seriesArr).toHaveLength(0);
  });
});
