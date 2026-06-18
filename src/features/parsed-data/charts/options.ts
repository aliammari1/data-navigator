/**
 * Pure, React-free ECharts option builders for the Data Profile screen.
 *
 * Extracted out of the 1977-line screen so each chart option is independently
 * testable and so the screen never rebuilds option blobs inline. Every builder
 * is a pure function of the profile/detail data — no DOM, no React, no closures
 * over component state — which also keeps them safe to run in a worker later.
 *
 * Charts render through `<ProfileChart>` with `notMerge`/`lazyUpdate`, so option
 * identity changes update the existing instance instead of re-initialising it.
 *
 * For wide datasets the per-column overview/heatmap series enable ECharts
 * `large`/`progressive` mode and thin axis labels so hundreds of columns render
 * without one rotated label per bar.
 */

import type { ColProfile, ColumnDetail } from "../model/types";
import { profileScore } from "../model/summary-map";

const TOOLTIP_BASE = {
  backgroundColor: "#0f172a",
  borderColor: "rgba(255,255,255,0.12)",
  textStyle: { color: "#e2e8f0" },
} as const;

const TYPE_COLORS: Record<string, string> = {
  integer: "#3b82f6",
  float: "#1E40AF",
  string: "#a855f7",
  boolean: "#22c55e",
  date: "#f97316",
  unknown: "#64748b",
};

/** Above this column count, switch per-column charts to large/progressive mode. */
const WIDE_THRESHOLD = 60;
const LARGE_THRESHOLD = 100;

function columnAxisLabel(columnCount: number) {
  return {
    color: "#94a3b8",
    // Thin out labels on wide datasets instead of rendering one per column.
    interval: columnCount > WIDE_THRESHOLD ? ("auto" as const) : 0,
    rotate: 35,
    fontSize: 10,
  };
}

/** Per-column completeness (bar) + validity (line). */
export function overviewQualityOption(
  profiles: ColProfile[],
): Record<string, unknown> | null {
  if (profiles.length === 0) return null;

  const names = profiles.map((profile) => profile.name);
  const completeness = profiles.map((profile) =>
    Number(profile.completeness.toFixed(4)),
  );
  const validity = profiles.map((profile) =>
    Number(profile.validity.toFixed(4)),
  );

  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis", ...TOOLTIP_BASE },
    legend: {
      data: ["Completeness", "Validity"],
      textStyle: { color: "#94a3b8" },
      top: 5,
    },
    grid: { top: 50, bottom: 70, left: 55, right: 20 },
    xAxis: {
      type: "category",
      data: names,
      axisLabel: columnAxisLabel(profiles.length),
      axisLine: { lineStyle: { color: "#334155" } },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 1,
      axisLabel: {
        color: "#94a3b8",
        formatter: (value: number) => `${(value * 100).toFixed(0)}%`,
      },
      splitLine: { lineStyle: { color: "rgba(148,163,184,0.14)" } },
    },
    series: [
      {
        name: "Completeness",
        type: "bar",
        data: completeness,
        itemStyle: { color: "#22c55e", borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 18,
        large: profiles.length > LARGE_THRESHOLD,
        largeThreshold: LARGE_THRESHOLD,
        progressive: 2000,
      },
      {
        name: "Validity",
        type: "line",
        data: validity,
        lineStyle: { color: "#1E40AF", width: 2 },
        itemStyle: { color: "#1E40AF" },
        symbol: profiles.length > WIDE_THRESHOLD ? "none" : "circle",
        symbolSize: 5,
        showSymbol: profiles.length <= WIDE_THRESHOLD,
      },
    ],
  };
}

/** Donut of column-type distribution. */
export function typeMixOption(
  profiles: ColProfile[],
): Record<string, unknown> | null {
  if (profiles.length === 0) return null;

  const counts: Record<string, number> = {};
  for (const profile of profiles) {
    counts[profile.type] = (counts[profile.type] ?? 0) + 1;
  }

  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "item", ...TOOLTIP_BASE },
    series: [
      {
        type: "pie",
        radius: ["48%", "74%"],
        data: Object.entries(counts).map(([name, value]) => ({
          name,
          value,
          itemStyle: { color: TYPE_COLORS[name] ?? "#64748b" },
        })),
        label: { color: "#94a3b8", fontSize: 11 },
      },
    ],
  };
}

/** Single-row null-rate heatmap, one cell per column. */
export function nullHeatmapOption(
  profiles: ColProfile[],
): Record<string, unknown> | null {
  if (profiles.length === 0) return null;

  return {
    backgroundColor: "transparent",
    tooltip: {
      formatter: (params: { data: [number, number, number] }) =>
        `${profiles[params.data[0]]?.name ?? ""}<br/>Null rate: ${(
          params.data[2] * 100
        ).toFixed(2)}%`,
    },
    grid: { top: 20, bottom: 40, left: 80, right: 20 },
    xAxis: {
      type: "category",
      data: profiles.map((profile) => profile.name),
      axisLabel: columnAxisLabel(profiles.length),
    },
    yAxis: {
      type: "category",
      data: ["Null Rate"],
      axisLabel: { color: "#94a3b8" },
    },
    visualMap: {
      min: 0,
      max: 0.2,
      calculable: false,
      orient: "horizontal",
      show: false,
      inRange: { color: ["#1e293b", "#f97316", "#ef4444"] },
    },
    series: [
      {
        type: "heatmap",
        data: profiles.map((profile, index) => [
          index,
          0,
          Number(profile.nullRate.toFixed(4)),
        ]),
        large: profiles.length > LARGE_THRESHOLD,
        progressive: 2000,
        label: {
          show: profiles.length <= WIDE_THRESHOLD,
          formatter: (params: { data: [number, number, number] }) =>
            params.data[2] === 0
              ? "✓"
              : `${(params.data[2] * 100).toFixed(0)}%`,
          color: "#fff",
          fontSize: 10,
        },
      },
    ],
  };
}

/** Numeric frequency-distribution histogram for the selected column. */
export function histogramOption(
  detail: ColumnDetail | null,
): Record<string, unknown> | null {
  const bins = detail?.histogram;
  if (!bins || bins.length === 0) return null;

  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      ...TOOLTIP_BASE,
      formatter: (params: Array<{ data: number; name: string }>) =>
        `${params[0].name}<br/>Count: ${params[0].data.toLocaleString()}`,
    },
    grid: { top: 20, bottom: 50, left: 50, right: 20 },
    xAxis: {
      type: "category",
      data: bins.map((bin) => bin.lo.toFixed(1)),
      axisLabel: { color: "#94a3b8", rotate: 30, fontSize: 9 },
      axisLine: { lineStyle: { color: "#334155" } },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: "#94a3b8" },
      splitLine: { lineStyle: { color: "rgba(148,163,184,0.14)" } },
    },
    series: [
      {
        type: "bar",
        data: bins.map((bin) => bin.count),
        barWidth: "95%",
        itemStyle: { color: "#1E40AF", borderRadius: [4, 4, 0, 0] },
      },
    ],
  };
}

/** Horizontal top-values bar chart for the selected column. */
export function topValuesOption(
  detail: ColumnDetail | null,
): Record<string, unknown> | null {
  const topValues = detail?.topValues;
  if (!topValues || topValues.length === 0) return null;

  const top = topValues.slice(0, 10);

  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis", ...TOOLTIP_BASE },
    grid: { top: 10, bottom: 40, left: 20, right: 80 },
    xAxis: {
      type: "value",
      axisLabel: { color: "#94a3b8" },
      splitLine: { lineStyle: { color: "rgba(148,163,184,0.14)" } },
    },
    yAxis: {
      type: "category",
      data: top.map((value) => value.value.substring(0, 20)).reverse(),
      axisLabel: { color: "#94a3b8", fontSize: 11 },
      axisLine: { lineStyle: { color: "#334155" } },
    },
    series: [
      {
        type: "bar",
        data: top.map((value) => value.count).reverse(),
        barMaxWidth: 20,
        itemStyle: { color: "#F59E0B", borderRadius: [0, 4, 4, 0] },
        label: {
          show: true,
          position: "right",
          color: "#94a3b8",
          fontSize: 10,
          formatter: (params: { value: number }) =>
            params.value.toLocaleString(),
        },
      },
    ],
  };
}

export { profileScore };
