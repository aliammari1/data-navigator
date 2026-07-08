/**
 * Reusable ECharts option builders + dense-series perf flags.
 *
 * Keeping the option construction here (not in React render) means the chart
 * worker and the main-thread fallback consume identical, pre-built options.
 */

import type { EChartsOption } from "./echarts-core";

/** Dense line/scatter perf flags — the ECharts equivalent of uPlot when you
 *  must stay on ECharts (LTTB downsampling, progressive render, no animation). */
export const DENSE_SERIES_FLAGS = {
  large: true,
  largeThreshold: 2000,
  sampling: "lttb" as const,
  progressive: 4000,
  progressiveThreshold: 5000,
  showSymbol: false,
  animation: false,
};

export interface SeriesSpec {
  name: string;
  data: number[] | [number, number][];
  color?: string;
}

/** Multi-series line chart (dense-series flags applied). */
export function buildLineOption(
  categories: (string | number)[],
  series: SeriesSpec[],
  opts: { title?: string; dark?: boolean } = {},
): EChartsOption {
  return {
    title: opts.title ? { text: opts.title } : undefined,
    tooltip: { trigger: "axis" },
    legend: series.length > 1 ? { data: series.map((s) => s.name) } : undefined,
    grid: { left: 48, right: 24, top: opts.title ? 56 : 32, bottom: 40 },
    xAxis: { type: "category", data: categories.map(String), boundaryGap: false },
    yAxis: { type: "value" },
    series: series.map((s) => ({
      name: s.name,
      type: "line",
      data: s.data,
      itemStyle: s.color ? { color: s.color } : undefined,
      ...DENSE_SERIES_FLAGS,
    })),
  };
}

/** Bar chart. */
export function buildBarOption(
  categories: (string | number)[],
  series: SeriesSpec[],
  opts: { title?: string; horizontal?: boolean } = {},
): EChartsOption {
  const cat = { type: "category" as const, data: categories.map(String) };
  const val = { type: "value" as const };
  return {
    title: opts.title ? { text: opts.title } : undefined,
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: series.length > 1 ? { data: series.map((s) => s.name) } : undefined,
    grid: { left: 48, right: 24, top: opts.title ? 56 : 32, bottom: 40 },
    xAxis: opts.horizontal ? val : cat,
    yAxis: opts.horizontal ? cat : val,
    series: series.map((s) => ({
      name: s.name,
      type: "bar",
      data: s.data,
      itemStyle: s.color ? { color: s.color } : undefined,
    })),
  };
}

/** Pie / donut chart. */
export function buildPieOption(
  data: { name: string; value: number }[],
  opts: { title?: string; donut?: boolean } = {},
): EChartsOption {
  return {
    title: opts.title ? { text: opts.title, left: "center" } : undefined,
    tooltip: { trigger: "item" },
    legend: { bottom: 0 },
    series: [
      {
        type: "pie",
        radius: opts.donut ? ["45%", "70%"] : "65%",
        center: ["50%", "48%"],
        data,
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.3)" } },
      },
    ],
  };
}

/** Heatmap (correlation matrix etc.). */
export function buildHeatmapOption(
  xLabels: string[],
  yLabels: string[],
  cells: [number, number, number][],
  opts: { title?: string; min?: number; max?: number } = {},
): EChartsOption {
  return {
    title: opts.title ? { text: opts.title } : undefined,
    tooltip: { position: "top" },
    grid: { left: 80, right: 24, top: opts.title ? 56 : 32, bottom: 60 },
    xAxis: { type: "category", data: xLabels, splitArea: { show: true } },
    yAxis: { type: "category", data: yLabels, splitArea: { show: true } },
    visualMap: {
      min: opts.min ?? -1,
      max: opts.max ?? 1,
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: 8,
      inRange: { color: ["#2563eb", "#f8fafc", "#dc2626"] },
    },
    series: [{ type: "heatmap", data: cells, label: { show: false } }],
  };
}

/** Scatter (cluster visualisation: each cluster a series). */
export function buildScatterOption(
  clusters: { name: string; points: [number, number][]; color?: string }[],
  opts: { title?: string } = {},
): EChartsOption {
  return {
    title: opts.title ? { text: opts.title } : undefined,
    tooltip: { trigger: "item" },
    legend: { bottom: 0 },
    grid: { left: 48, right: 24, top: opts.title ? 56 : 32, bottom: 40 },
    xAxis: { type: "value", scale: true },
    yAxis: { type: "value", scale: true },
    series: clusters.map((c) => ({
      name: c.name,
      type: "scatter",
      data: c.points,
      symbolSize: 8,
      itemStyle: c.color ? { color: c.color } : undefined,
      large: true,
      largeThreshold: 2000,
    })),
  };
}
