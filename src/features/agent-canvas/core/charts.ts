"use client";
/**
 * ChartEngine — converts (chartType, data[], widgetSpec) → ECharts option.
 * Fully dynamic: auto-detects column roles from data shape when spec hints are absent.
 */

import type { ChartType, KPICard, WidgetSpec } from "./types";

// ─── Shared Theme ─────────────────────────────────────────────────────────────

export const PALETTE = [
  "#89b4fa",
  "#a6e3a1",
  "#fab387",
  "#f38ba8",
  "#cba6f7",
  "#94e2d5",
  "#f9e2af",
  "#89dceb",
  "#b4befe",
  "#74c7ec",
];

const BASE = {
  backgroundColor: "transparent",
  textStyle: { color: "#a1a1aa", fontFamily: "inherit" },
};
const TTP = {
  backgroundColor: "#1e1e2e",
  borderColor: "#ffffff12",
  textStyle: { color: "#cdd6f4", fontSize: 11 },
};
const AXIS_LABEL = { color: "#6c7086", fontSize: 10 };
const SPLIT_LINE = { lineStyle: { color: "#ffffff08" } };
const AXIS_LINE = { lineStyle: { color: "#ffffff0f" } };

// ─── Column Classification ────────────────────────────────────────────────────

interface Cols {
  catCols: string[];
  numCols: string[];
  allCols: string[];
}

function classifyCols(row: Record<string, unknown>): Cols {
  const allCols = Object.keys(row);
  const catCols = allCols.filter((k) => {
    const v = row[k];
    return typeof v === "string" || v === null;
  });
  const numCols = allCols.filter((k) => {
    const v = row[k];
    return typeof v === "number" || typeof v === "bigint";
  });
  return { catCols, numCols, allCols };
}

function pickDim(spec: WidgetSpec, cols: Cols): string {
  // Use spec hint if valid
  const hint = spec.dimensions[0];
  if (hint && cols.allCols.includes(hint)) return hint;
  // First string column
  if (cols.catCols[0]) return cols.catCols[0];
  // Fallback: first col
  return cols.allCols[0] ?? "";
}

function pickMetrics(spec: WidgetSpec, cols: Cols, n = 4): string[] {
  const hints = spec.metrics.filter((m) => cols.allCols.includes(m));
  if (hints.length > 0) return hints.slice(0, n);
  return cols.numCols.slice(0, n);
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

function fmtVal(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? "");
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(2);
}

// ─── Individual Builders ──────────────────────────────────────────────────────

function buildBar(
  data: Record<string, unknown>[],
  spec: WidgetSpec,
  horizontal: boolean,
): Record<string, unknown> {
  const cols = classifyCols(data[0]);
  const dim = pickDim(spec, cols);
  const mets = pickMetrics(spec, cols, 3);

  const categories = data.map((r) => String(r[dim] ?? ""));
  const series = mets.map((m, i) => ({
    name: fmtLabel(m),
    type: "bar",
    data: data.map((r) => toNum(r[m])),
    itemStyle: {
      color: PALETTE[i % PALETTE.length],
      borderRadius: horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0],
    },
    barMaxWidth: 32,
    emphasis: { focus: "series" },
  }));

  const catAxis = {
    type: "category",
    data: categories,
    axisLabel: { ...AXIS_LABEL, width: 90, overflow: "truncate" as const },
    axisLine: AXIS_LINE,
    axisTick: { show: false },
  };
  const valAxis = {
    type: "value",
    axisLabel: { ...AXIS_LABEL, formatter: fmtVal },
    splitLine: SPLIT_LINE,
  };

  return {
    ...BASE,
    tooltip: { ...TTP, trigger: "axis", axisPointer: { type: "shadow" } },
    legend:
      mets.length > 1
        ? { textStyle: { color: "#6c7086", fontSize: 10 }, top: 0 }
        : undefined,
    grid: {
      top: mets.length > 1 ? 32 : 16,
      right: 16,
      bottom: horizontal ? 12 : 28,
      left: 12,
      containLabel: true,
    },
    xAxis: horizontal ? valAxis : catAxis,
    yAxis: horizontal ? catAxis : valAxis,
    series,
  };
}

function buildStackedBar(
  data: Record<string, unknown>[],
  spec: WidgetSpec,
  horizontal: boolean,
): Record<string, unknown> {
  const cols = classifyCols(data[0]);
  // If 3 cols: dim, series, value
  // If 2 cols (category + value): treat as simple bar with multiple series from pivoted data
  const dim = pickDim(spec, cols);
  const mets = pickMetrics(spec, cols, 1);
  const met = mets[0];

  // Check if data has a "series" column
  const seriesCol =
    spec.dimensions[1] && cols.allCols.includes(spec.dimensions[1])
      ? spec.dimensions[1]
      : cols.catCols.find((c) => c !== dim);

  if (!seriesCol || !met) return buildBar(data, spec, horizontal);

  const categories = [...new Set(data.map((r) => String(r[dim] ?? "")))];
  const seriesKeys = [
    ...new Set(data.map((r) => String(r[seriesCol] ?? ""))),
  ].slice(0, 10);

  const series = seriesKeys.map((sk, i) => ({
    name: sk,
    type: "bar",
    stack: "total",
    data: categories.map((cat) => {
      const row = data.find(
        (r) =>
          String(r[dim] ?? "") === cat && String(r[seriesCol] ?? "") === sk,
      );
      return row ? toNum(row[met]) : 0;
    }),
    itemStyle: { color: PALETTE[i % PALETTE.length] },
    barMaxWidth: 36,
    emphasis: { focus: "series" },
  }));

  const catAxis = {
    type: "category",
    data: categories,
    axisLabel: { ...AXIS_LABEL, width: 90, overflow: "truncate" as const },
    axisLine: AXIS_LINE,
    axisTick: { show: false },
  };
  const valAxis = {
    type: "value",
    axisLabel: { ...AXIS_LABEL, formatter: fmtVal },
    splitLine: SPLIT_LINE,
  };

  return {
    ...BASE,
    tooltip: { ...TTP, trigger: "axis", axisPointer: { type: "shadow" } },
    legend: {
      textStyle: { color: "#6c7086", fontSize: 10 },
      top: 0,
      type: "scroll",
    },
    grid: {
      top: 36,
      right: 16,
      bottom: horizontal ? 8 : 28,
      left: 12,
      containLabel: true,
    },
    xAxis: horizontal ? valAxis : catAxis,
    yAxis: horizontal ? catAxis : valAxis,
    series,
  };
}

function buildLine(
  data: Record<string, unknown>[],
  spec: WidgetSpec,
  isArea: boolean,
  isMulti: boolean,
): Record<string, unknown> {
  const cols = classifyCols(data[0]);
  const dim = pickDim(spec, cols);
  const mets = pickMetrics(spec, cols, isMulti ? 4 : 1);

  const categories = data.map((r) => String(r[dim] ?? ""));

  const series = mets.map((m, i) => ({
    name: fmtLabel(m),
    type: "line",
    data: data.map((r) => toNum(r[m])),
    smooth: true,
    symbol: "circle",
    symbolSize: 4,
    lineStyle: { color: PALETTE[i % PALETTE.length], width: 2.5 },
    itemStyle: { color: PALETTE[i % PALETTE.length] },
    ...(isArea
      ? {
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: `${PALETTE[i % PALETTE.length]}55` },
                { offset: 1, color: `${PALETTE[i % PALETTE.length]}08` },
              ],
            },
          },
        }
      : {}),
    emphasis: { focus: "series" },
  }));

  return {
    ...BASE,
    tooltip: { ...TTP, trigger: "axis" },
    legend:
      mets.length > 1
        ? { textStyle: { color: "#6c7086", fontSize: 10 }, top: 0 }
        : undefined,
    grid: {
      top: mets.length > 1 ? 32 : 16,
      right: 16,
      bottom: 28,
      left: 12,
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: categories,
      axisLabel: { ...AXIS_LABEL, rotate: categories.length > 12 ? 35 : 0 },
      axisLine: AXIS_LINE,
      axisTick: { show: false },
      boundaryGap: false,
    },
    yAxis: {
      type: "value",
      axisLabel: { ...AXIS_LABEL, formatter: fmtVal },
      splitLine: SPLIT_LINE,
    },
    series,
  };
}

function buildPie(
  data: Record<string, unknown>[],
  spec: WidgetSpec,
  isDonut: boolean,
): Record<string, unknown> {
  const cols = classifyCols(data[0]);
  const dim = pickDim(spec, cols);
  const met = pickMetrics(spec, cols, 1)[0] ?? cols.numCols[0];

  const pieData = data.slice(0, 14).map((r, i) => ({
    name: String(r[dim] ?? `Item ${i + 1}`),
    value: toNum(r[met ?? cols.numCols[0]] ?? 0),
    itemStyle: { color: PALETTE[i % PALETTE.length] },
  }));

  return {
    ...BASE,
    tooltip: {
      ...TTP,
      trigger: "item",
      formatter: (p: { name: string; value: number; percent: number }) =>
        `${p.name}<br/>${fmtVal(p.value)} (${p.percent?.toFixed(1)}%)`,
    },
    legend: {
      orient: "vertical",
      right: 8,
      top: "center",
      textStyle: { color: "#6c7086", fontSize: 10 },
      type: "scroll",
    },
    series: [
      {
        type: "pie",
        radius: isDonut ? ["40%", "68%"] : "68%",
        center: ["40%", "50%"],
        data: pieData,
        label: { show: false },
        emphasis: { scale: true, scaleSize: 5 },
        itemStyle: { borderRadius: 4, borderColor: "#1e1e2e", borderWidth: 2 },
        animationType: "expansion",
      },
    ],
  };
}

function buildScatter(
  data: Record<string, unknown>[],
  spec: WidgetSpec,
): Record<string, unknown> {
  const cols = classifyCols(data[0]);
  const mets = pickMetrics(spec, cols, 2);
  const xCol = mets[0] ?? cols.numCols[0] ?? "";
  const yCol = mets[1] ?? cols.numCols[1] ?? xCol;
  const label = pickDim(spec, cols);

  const scData = data
    .slice(0, 300)
    .map((r) => [toNum(r[xCol]), toNum(r[yCol]), String(r[label] ?? "")]);

  return {
    ...BASE,
    tooltip: {
      ...TTP,
      trigger: "item",
      formatter: (p: { value: [number, number, string] }) =>
        `${p.value[2]}<br/>X: ${fmtVal(p.value[0])}<br/>Y: ${fmtVal(p.value[1])}`,
    },
    grid: { top: 16, right: 16, bottom: 36, left: 12, containLabel: true },
    xAxis: {
      type: "value",
      name: fmtLabel(xCol),
      nameTextStyle: { color: "#52525b", fontSize: 9 },
      axisLabel: { ...AXIS_LABEL, formatter: fmtVal },
      splitLine: SPLIT_LINE,
    },
    yAxis: {
      type: "value",
      name: fmtLabel(yCol),
      nameTextStyle: { color: "#52525b", fontSize: 9 },
      axisLabel: { ...AXIS_LABEL, formatter: fmtVal },
      splitLine: SPLIT_LINE,
    },
    series: [
      {
        type: "scatter",
        data: scData,
        symbolSize: 6,
        itemStyle: { color: PALETTE[0], opacity: 0.75 },
        emphasis: { scale: true },
      },
    ],
  };
}

function buildHeatmap(
  data: Record<string, unknown>[],
  spec: WidgetSpec,
): Record<string, unknown> {
  const cols = classifyCols(data[0]);
  const rowC =
    spec.dimensions[0] && cols.allCols.includes(spec.dimensions[0])
      ? spec.dimensions[0]
      : (cols.catCols[0] ?? "");
  const colC =
    spec.dimensions[1] && cols.allCols.includes(spec.dimensions[1])
      ? spec.dimensions[1]
      : (cols.catCols[1] ?? "");
  const met = pickMetrics(spec, cols, 1)[0] ?? "";

  const rows = [...new Set(data.map((r) => String(r[rowC] ?? "")))].slice(
    0,
    20,
  );
  const colsU = [...new Set(data.map((r) => String(r[colC] ?? "")))].slice(
    0,
    20,
  );
  const vals = data.map((r) => [
    String(r[rowC] ?? ""),
    String(r[colC] ?? ""),
    toNum(r[met]),
  ]);
  const max = Math.max(...vals.map((v) => v[2] as number), 1);

  return {
    ...BASE,
    tooltip: { ...TTP },
    grid: { top: 16, right: 60, bottom: 36, left: 12, containLabel: true },
    xAxis: {
      type: "category",
      data: colsU,
      axisLabel: { ...AXIS_LABEL, rotate: 35 },
      axisTick: { show: false },
    },
    yAxis: {
      type: "category",
      data: rows,
      axisLabel: AXIS_LABEL,
      axisTick: { show: false },
    },
    visualMap: {
      min: 0,
      max,
      calculable: true,
      orient: "vertical",
      right: 0,
      top: "center",
      textStyle: { color: "#6c7086", fontSize: 9 },
      inRange: { color: ["#1e1e2e", "#89b4fa"] },
    },
    series: [
      {
        type: "heatmap",
        data: vals,
        label: { show: false },
        emphasis: { itemStyle: { shadowBlur: 10 } },
      },
    ],
  };
}

function buildTreemap(
  data: Record<string, unknown>[],
  spec: WidgetSpec,
): Record<string, unknown> {
  const cols = classifyCols(data[0]);
  const dim = pickDim(spec, cols);
  const met = pickMetrics(spec, cols, 1)[0] ?? "";

  const tmData = data.slice(0, 40).map((r, i) => ({
    name: String(r[dim] ?? `Item ${i + 1}`),
    value: toNum(r[met] ?? 0),
    itemStyle: { color: PALETTE[i % PALETTE.length] },
  }));

  return {
    ...BASE,
    tooltip: {
      ...TTP,
      formatter: (p: { name: string; value: number }) =>
        `${p.name}: ${fmtVal(p.value)}`,
    },
    series: [
      {
        type: "treemap",
        data: tmData,
        label: { show: true, formatter: "{b}", color: "#cdd6f4", fontSize: 11 },
        emphasis: { itemStyle: { borderColor: "#ffffff30" } },
        levels: [
          {
            itemStyle: { borderWidth: 2, borderColor: "#1e1e2e", gapWidth: 2 },
          },
        ],
      },
    ],
  };
}

function buildRadar(
  data: Record<string, unknown>[],
  spec: WidgetSpec,
): Record<string, unknown> {
  const cols = classifyCols(data[0]);
  const dim = pickDim(spec, cols);
  const mets = pickMetrics(spec, cols, 6);
  if (mets.length < 2) return buildBar(data, spec, false);

  const maxPerMet = mets.map((m) =>
    Math.max(...data.map((r) => toNum(r[m])), 1),
  );
  const indicators = mets.map((m, i) => ({
    name: fmtLabel(m),
    max: maxPerMet[i],
  }));

  const series = data.slice(0, 6).map((r, i) => ({
    value: mets.map((m) => toNum(r[m])),
    name: String(r[dim] ?? `Series ${i + 1}`),
    areaStyle: { color: `${PALETTE[i % PALETTE.length]}33` },
    lineStyle: { color: PALETTE[i % PALETTE.length] },
    itemStyle: { color: PALETTE[i % PALETTE.length] },
  }));

  return {
    ...BASE,
    tooltip: { ...TTP },
    legend: {
      data: series.map((s) => s.name),
      textStyle: { color: "#6c7086", fontSize: 10 },
      top: 0,
    },
    radar: {
      indicator: indicators,
      axisName: { color: "#6c7086", fontSize: 10 },
      splitLine: { lineStyle: { color: "#ffffff08" } },
      splitArea: { show: false },
      axisLine: AXIS_LINE,
    },
    series: [{ type: "radar", data: series }],
  };
}

function buildGauge(
  data: Record<string, unknown>[],
  spec: WidgetSpec,
): Record<string, unknown> {
  const cols = classifyCols(data[0]);
  const met = pickMetrics(spec, cols, 1)[0] ?? "";
  const raw = data[0] ? toNum(data[0][met] ?? Object.values(data[0])[0]) : 0;
  const value = Math.min(100, Math.max(0, raw));

  const color = value >= 80 ? "#10b981" : value >= 60 ? "#f59e0b" : "#ef4444";

  return {
    ...BASE,
    series: [
      {
        type: "gauge",
        radius: "85%",
        startAngle: 200,
        endAngle: -20,
        min: 0,
        max: 100,
        data: [{ value: parseFloat(value.toFixed(1)), name: fmtLabel(met) }],
        axisLine: {
          lineStyle: {
            width: 14,
            color: [
              [value / 100, color],
              [1, "#27272a"],
            ],
          },
        },
        axisTick: { show: false },
        axisLabel: { color: "#6c7086", fontSize: 9 },
        splitLine: { lineStyle: { color: "#3f3f46", width: 2 } },
        pointer: { itemStyle: { color }, length: "60%" },
        title: { offsetCenter: ["0%", "75%"], color: "#71717a", fontSize: 11 },
        detail: {
          valueAnimation: true,
          formatter: "{value}%",
          color,
          fontSize: 24,
          fontWeight: 700,
          offsetCenter: ["0%", "30%"],
        },
      },
    ],
  };
}

function buildFunnel(
  data: Record<string, unknown>[],
  spec: WidgetSpec,
): Record<string, unknown> {
  const cols = classifyCols(data[0]);
  const dim = pickDim(spec, cols);
  const met = pickMetrics(spec, cols, 1)[0] ?? "";

  const sorted = [...data]
    .sort((a, b) => toNum(b[met]) - toNum(a[met]))
    .slice(0, 10);
  const fData = sorted.map((r, i) => ({
    name: String(r[dim] ?? `Stage ${i + 1}`),
    value: toNum(r[met] ?? 0),
    itemStyle: { color: PALETTE[i % PALETTE.length] },
  }));

  return {
    ...BASE,
    tooltip: {
      ...TTP,
      trigger: "item",
      formatter: (p: { name: string; value: number }) =>
        `${p.name}: ${fmtVal(p.value)}`,
    },
    series: [
      {
        type: "funnel",
        left: "10%",
        width: "80%",
        top: 16,
        bottom: 8,
        data: fData,
        label: {
          position: "inside",
          color: "#1e1e2e",
          fontSize: 11,
          fontWeight: 600,
        },
        emphasis: { focus: "self" },
        itemStyle: { borderColor: "#1e1e2e", borderWidth: 2 },
      },
    ],
  };
}

// ─── KPI Cards ────────────────────────────────────────────────────────────────

function kpiColorClass(key: string): string {
  const k = key.toLowerCase();
  if (k.match(/success|ok|complete|done|pass/))
    return "border-emerald-500/20 bg-emerald-500/5";
  if (k.match(/fail|error|decline|reject|cancel/))
    return "border-red-500/20 bg-red-500/5";
  if (k.match(/warn|pending|hold|wait|instance/))
    return "border-amber-500/20 bg-amber-500/5";
  if (k.match(/count|total|record|row/))
    return "border-blue-500/20 bg-blue-500/5";
  if (k.match(/rate|pct|percent|ratio|score/))
    return "border-violet-500/20 bg-violet-500/5";
  if (k.match(/amount|revenue|profit|cost|price|value|sum/))
    return "border-amber-500/20 bg-amber-500/5";
  if (k.match(/avg|mean|median/)) return "border-cyan-500/20 bg-cyan-500/5";
  return "border-zinc-700/50 bg-zinc-800/30";
}

function kpiIconHint(key: string): string {
  const k = key.toLowerCase();
  if (k.match(/success|ok|pass/)) return "check";
  if (k.match(/fail|error|decline/)) return "x";
  if (k.match(/count|total|record/)) return "hash";
  if (k.match(/amount|revenue|sum/)) return "zap";
  if (k.match(/rate|pct|percent/)) return "percent";
  if (k.match(/avg|mean/)) return "activity";
  if (k.match(/time|duration/)) return "clock";
  if (k.match(/customer|user/)) return "users";
  return "bar";
}

function kpiFormatValue(key: string, raw: unknown): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return String(raw ?? "—");
  const k = key.toLowerCase();

  // Rate/percentage (0–1 range → %)
  if (
    (k.match(/rate|ratio|pct|percent|score/) || (n > 0 && n <= 1)) &&
    !k.match(/id|count/)
  ) {
    if (n <= 1) return `${(n * 100).toFixed(1)}%`;
    return `${n.toFixed(1)}%`;
  }
  return fmtVal(n);
}

export function buildKPICards(row: Record<string, unknown>): KPICard[] {
  return Object.entries(row)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([key, val]) => ({
      label: fmtLabel(key),
      value: kpiFormatValue(key, val),
      colorClass: kpiColorClass(key),
      iconHint: kpiIconHint(key),
    }));
}

// ─── Data Table ────────────────────────────────────────────────────────────────

export function buildTableData(data: Record<string, unknown>[]): {
  headers: string[];
  rows: string[][];
} {
  if (!data.length) return { headers: [], rows: [] };
  const headers = Object.keys(data[0]);
  const rows = data.map((r) =>
    headers.map((h) => {
      const v = r[h];
      if (v === null || v === undefined) return "—";
      if (typeof v === "number" || typeof v === "bigint") return fmtVal(v);
      const s = String(v);
      return s.length > 40 ? `${s.slice(0, 37)}…` : s;
    }),
  );
  return { headers, rows };
}

// ─── Main Dispatch ────────────────────────────────────────────────────────────

export function buildEChartsOption(
  chartType: ChartType,
  data: Record<string, unknown>[],
  spec: WidgetSpec,
): Record<string, unknown> | null {
  if (!data.length) return null;
  const row0 = data[0];
  if (!row0) return null;

  switch (chartType) {
    case "bar":
      return buildBar(data, spec, false);
    case "horizontal-bar":
      return buildBar(data, spec, true);
    case "stacked-bar":
      return buildStackedBar(data, spec, false);
    case "stacked-horizontal-bar":
      return buildStackedBar(data, spec, true);
    case "line":
      return buildLine(data, spec, false, false);
    case "area":
      return buildLine(data, spec, true, false);
    case "multi-line":
      return buildLine(data, spec, false, true);
    case "pie":
      return buildPie(data, spec, false);
    case "donut":
      return buildPie(data, spec, true);
    case "scatter":
    case "bubble":
      return buildScatter(data, spec);
    case "heatmap":
      return buildHeatmap(data, spec);
    case "treemap":
      return buildTreemap(data, spec);
    case "radar":
      return buildRadar(data, spec);
    case "gauge":
      return buildGauge(data, spec);
    case "funnel":
      return buildFunnel(data, spec);
    default:
      return buildBar(data, spec, false);
  }
}
