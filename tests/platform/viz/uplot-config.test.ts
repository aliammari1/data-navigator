import { describe, expect, it } from "vitest";

import {
  buildSparklineOptions,
  buildTimeSeriesOptions,
  msToSeconds,
  toAlignedData,
} from "@/platform/viz/uplot-config";

// ---------------------------------------------------------------------------
// msToSeconds
// ---------------------------------------------------------------------------

describe("msToSeconds", () => {
  it("returns an empty Float64Array for an empty input", () => {
    const result = msToSeconds([]);
    expect(result).toBeInstanceOf(Float64Array);
    expect(result.length).toBe(0);
  });

  it("converts a single millisecond value to seconds", () => {
    const result = msToSeconds([1000]);
    expect(result).toBeInstanceOf(Float64Array);
    expect(result.length).toBe(1);
    expect(result[0]).toBe(1);
  });

  it("converts multiple millisecond values to seconds", () => {
    const result = msToSeconds([0, 1000, 2000, 3500]);
    expect(result).toBeInstanceOf(Float64Array);
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(1);
    expect(result[2]).toBe(2);
    expect(result[3]).toBe(3.5);
  });

  it("handles non-integer millisecond values", () => {
    const result = msToSeconds([1500, 750]);
    expect(result[0]).toBeCloseTo(1.5);
    expect(result[1]).toBeCloseTo(0.75);
  });

  it("accepts a Float64Array as input (ArrayLike<number>)", () => {
    const input = new Float64Array([0, 5000, 10000]);
    const result = msToSeconds(input);
    expect(result).toBeInstanceOf(Float64Array);
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(5);
    expect(result[2]).toBe(10);
  });

  it("preserves length from input array", () => {
    const input = [100, 200, 300, 400, 500];
    const result = msToSeconds(input);
    expect(result.length).toBe(input.length);
  });
});

// ---------------------------------------------------------------------------
// buildTimeSeriesOptions
// ---------------------------------------------------------------------------

describe("buildTimeSeriesOptions", () => {
  const singleSeries = [{ label: "Value", stroke: "#ff0000" }];
  const multiSeries = [
    { label: "Series A", stroke: "#ff0000" },
    { label: "Series B", stroke: "#00ff00" },
  ];

  it("returns an options object with the given width and height", () => {
    const opts = buildTimeSeriesOptions(800, 300, singleSeries);
    expect(opts.width).toBe(800);
    expect(opts.height).toBe(300);
  });

  it("sets default axisColor to #9ca3af when opts.axisColor is not provided (nullish coalescing false path)", () => {
    const opts = buildTimeSeriesOptions(800, 300, singleSeries);
    const axes = opts.axes as Array<{ stroke: string }>;
    expect(axes[0].stroke).toBe("#9ca3af");
    expect(axes[1].stroke).toBe("#9ca3af");
  });

  it("uses provided axisColor when opts.axisColor is supplied (nullish coalescing true path)", () => {
    const opts = buildTimeSeriesOptions(800, 300, singleSeries, { axisColor: "#ffffff" });
    const axes = opts.axes as Array<{ stroke: string }>;
    expect(axes[0].stroke).toBe("#ffffff");
    expect(axes[1].stroke).toBe("#ffffff");
  });

  it("defaults time scale to true when opts.time is not provided (nullish coalescing false path)", () => {
    const opts = buildTimeSeriesOptions(800, 300, singleSeries);
    const scales = opts.scales as { x: { time: boolean } };
    expect(scales.x.time).toBe(true);
  });

  it("sets time scale to false when opts.time=false (nullish coalescing true path)", () => {
    const opts = buildTimeSeriesOptions(800, 300, singleSeries, { time: false });
    const scales = opts.scales as { x: { time: boolean } };
    expect(scales.x.time).toBe(false);
  });

  it("sets time scale to true when opts.time=true explicitly", () => {
    const opts = buildTimeSeriesOptions(800, 300, singleSeries, { time: true });
    const scales = opts.scales as { x: { time: boolean } };
    expect(scales.x.time).toBe(true);
  });

  it("sets y scale auto=true", () => {
    const opts = buildTimeSeriesOptions(800, 300, singleSeries);
    const scales = opts.scales as { y: { auto: boolean } };
    expect(scales.y.auto).toBe(true);
  });

  it("prefixes series array with an empty object for the x series", () => {
    const opts = buildTimeSeriesOptions(800, 300, singleSeries);
    const seriesArr = opts.series as Array<Record<string, unknown>>;
    expect(seriesArr[0]).toEqual({});
  });

  it("maps series labels and strokes correctly", () => {
    const opts = buildTimeSeriesOptions(800, 300, singleSeries);
    const seriesArr = opts.series as Array<{ label: string; stroke: string }>;
    expect(seriesArr[1].label).toBe("Value");
    expect(seriesArr[1].stroke).toBe("#ff0000");
  });

  it("defaults series width to 1 when not provided (nullish coalescing false path)", () => {
    const opts = buildTimeSeriesOptions(800, 300, singleSeries);
    const seriesArr = opts.series as Array<{ width: number }>;
    expect(seriesArr[1].width).toBe(1);
  });

  it("uses provided series width when specified (nullish coalescing true path)", () => {
    const series = [{ label: "A", stroke: "#000", width: 3 }];
    const opts = buildTimeSeriesOptions(800, 300, series);
    const seriesArr = opts.series as Array<{ width: number }>;
    expect(seriesArr[1].width).toBe(3);
  });

  it("includes fill when series.fill is provided", () => {
    const series = [{ label: "A", stroke: "#000", fill: "rgba(0,0,0,0.1)" }];
    const opts = buildTimeSeriesOptions(800, 300, series);
    const seriesArr = opts.series as Array<{ fill?: string }>;
    expect(seriesArr[1].fill).toBe("rgba(0,0,0,0.1)");
  });

  it("sets points.show to false for every series entry", () => {
    const opts = buildTimeSeriesOptions(800, 300, multiSeries);
    const seriesArr = opts.series as Array<{ points?: { show: boolean } }>;
    expect(seriesArr[1].points?.show).toBe(false);
    expect(seriesArr[2].points?.show).toBe(false);
  });

  it("sets legend.show to false when series has exactly 1 item (length > 1 is false)", () => {
    const opts = buildTimeSeriesOptions(800, 300, singleSeries);
    const legend = opts.legend as { show: boolean };
    expect(legend.show).toBe(false);
  });

  it("sets legend.show to true when series has more than 1 item (length > 1 is true)", () => {
    const opts = buildTimeSeriesOptions(800, 300, multiSeries);
    const legend = opts.legend as { show: boolean };
    expect(legend.show).toBe(true);
  });

  it("defaults cursor drag x to true when opts.dragX is not provided (nullish coalescing false path)", () => {
    const opts = buildTimeSeriesOptions(800, 300, singleSeries);
    const cursor = opts.cursor as { drag: { x: boolean; y: boolean } };
    expect(cursor.drag.x).toBe(true);
    expect(cursor.drag.y).toBe(false);
  });

  it("sets cursor drag x to false when opts.dragX=false (nullish coalescing true path)", () => {
    const opts = buildTimeSeriesOptions(800, 300, singleSeries, { dragX: false });
    const cursor = opts.cursor as { drag: { x: boolean; y: boolean } };
    expect(cursor.drag.x).toBe(false);
  });

  it("sets cursor drag x to true when opts.dragX=true explicitly", () => {
    const opts = buildTimeSeriesOptions(800, 300, singleSeries, { dragX: true });
    const cursor = opts.cursor as { drag: { x: boolean; y: boolean } };
    expect(cursor.drag.x).toBe(true);
  });

  it("handles an empty series array (legend.show=false, series=[{}])", () => {
    const opts = buildTimeSeriesOptions(800, 300, []);
    const seriesArr = opts.series as Array<Record<string, unknown>>;
    expect(seriesArr).toHaveLength(1);
    expect(seriesArr[0]).toEqual({});
    const legend = opts.legend as { show: boolean };
    expect(legend.show).toBe(false);
  });

  it("accepts empty opts object without error", () => {
    const opts = buildTimeSeriesOptions(400, 200, singleSeries, {});
    expect(opts).toBeDefined();
  });

  it("handles multiple series building all entries", () => {
    const opts = buildTimeSeriesOptions(800, 300, multiSeries);
    const seriesArr = opts.series as Array<{ label?: string; stroke?: string }>;
    expect(seriesArr).toHaveLength(3); // x + 2 y series
    expect(seriesArr[1].label).toBe("Series A");
    expect(seriesArr[2].label).toBe("Series B");
  });
});

// ---------------------------------------------------------------------------
// buildSparklineOptions
// ---------------------------------------------------------------------------

describe("buildSparklineOptions", () => {
  it("returns an options object with the given width and height", () => {
    const opts = buildSparklineOptions(100, 40);
    expect(opts.width).toBe(100);
    expect(opts.height).toBe(40);
  });

  it("uses default stroke '#6366f1' when stroke is not provided", () => {
    const opts = buildSparklineOptions(100, 40);
    const seriesArr = opts.series as Array<{ stroke?: string }>;
    expect(seriesArr[1].stroke).toBe("#6366f1");
  });

  it("uses provided stroke when supplied", () => {
    const opts = buildSparklineOptions(100, 40, "#ff0000");
    const seriesArr = opts.series as Array<{ stroke?: string }>;
    expect(seriesArr[1].stroke).toBe("#ff0000");
  });

  it("uses default fill 'rgba(99,102,241,0.12)' when fill is not provided", () => {
    const opts = buildSparklineOptions(100, 40);
    const seriesArr = opts.series as Array<{ fill?: string }>;
    expect(seriesArr[1].fill).toBe("rgba(99,102,241,0.12)");
  });

  it("uses provided fill when supplied", () => {
    const opts = buildSparklineOptions(100, 40, "#6366f1", "rgba(0,0,0,0.5)");
    const seriesArr = opts.series as Array<{ fill?: string }>;
    expect(seriesArr[1].fill).toBe("rgba(0,0,0,0.5)");
  });

  it("sets time scale to false", () => {
    const opts = buildSparklineOptions(100, 40);
    const scales = opts.scales as { x: { time: boolean } };
    expect(scales.x.time).toBe(false);
  });

  it("sets y scale auto=true", () => {
    const opts = buildSparklineOptions(100, 40);
    const scales = opts.scales as { y: { auto: boolean } };
    expect(scales.y.auto).toBe(true);
  });

  it("sets series width to 1", () => {
    const opts = buildSparklineOptions(100, 40);
    const seriesArr = opts.series as Array<{ width?: number }>;
    expect(seriesArr[1].width).toBe(1);
  });

  it("sets points.show to false for the data series", () => {
    const opts = buildSparklineOptions(100, 40);
    const seriesArr = opts.series as Array<{ points?: { show: boolean } }>;
    expect(seriesArr[1].points?.show).toBe(false);
  });

  it("has exactly 2 series entries (x placeholder + data)", () => {
    const opts = buildSparklineOptions(100, 40);
    const seriesArr = opts.series as Array<Record<string, unknown>>;
    expect(seriesArr).toHaveLength(2);
    expect(seriesArr[0]).toEqual({});
  });

  it("hides both axes (show=false)", () => {
    const opts = buildSparklineOptions(100, 40);
    const axes = opts.axes as Array<{ show: boolean }>;
    expect(axes[0].show).toBe(false);
    expect(axes[1].show).toBe(false);
  });

  it("hides cursor", () => {
    const opts = buildSparklineOptions(100, 40);
    const cursor = opts.cursor as { show: boolean };
    expect(cursor.show).toBe(false);
  });

  it("hides legend", () => {
    const opts = buildSparklineOptions(100, 40);
    const legend = opts.legend as { show: boolean };
    expect(legend.show).toBe(false);
  });

  it("accepts all four arguments without error", () => {
    const opts = buildSparklineOptions(200, 60, "#abc123", "rgba(1,2,3,0.4)");
    expect(opts.width).toBe(200);
    expect(opts.height).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// toAlignedData
// ---------------------------------------------------------------------------

describe("toAlignedData", () => {
  it("returns an array where the first element is the x array", () => {
    const x = [0, 1, 2, 3];
    const y1 = [10, 20, 30, 40];
    const result = toAlignedData(x, [y1]);
    expect(result[0]).toBe(x);
  });

  it("appends a single y series after x", () => {
    const x = [0, 1, 2];
    const y1 = [5, 6, 7];
    const result = toAlignedData(x, [y1]);
    expect(result).toHaveLength(2);
    expect(result[1]).toBe(y1);
  });

  it("appends multiple y series after x in order", () => {
    const x = [0, 1, 2];
    const y1 = [1, 2, 3];
    const y2 = [4, 5, 6];
    const y3 = [7, 8, 9];
    const result = toAlignedData(x, [y1, y2, y3]);
    expect(result).toHaveLength(4);
    expect(result[0]).toBe(x);
    expect(result[1]).toBe(y1);
    expect(result[2]).toBe(y2);
    expect(result[3]).toBe(y3);
  });

  it("handles an empty y series array (only x present)", () => {
    const x = [0, 1, 2];
    const result = toAlignedData(x, []);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(x);
  });

  it("accepts Float64Array typed arrays for x and y", () => {
    const x = new Float64Array([0, 1, 2]);
    const y = new Float64Array([10, 20, 30]);
    const result = toAlignedData(x, [y]);
    expect(result[0]).toBe(x);
    expect(result[1]).toBe(y);
  });

  it("handles NaN values in y arrays (gap representation)", () => {
    const x = [0, 1, 2];
    const y = [1, NaN, 3];
    const result = toAlignedData(x, [y]);
    expect((result[1] as number[])[1]).toBeNaN();
  });
});
