import type { ChartType } from "@/features/agent-canvas/core/types";
import type { AggregateFn, FilterDef } from "./types";
// ─── Constants ────────────────────────────────────────────────────────────────

export const CHART_TYPES: Array<{ type: ChartType; label: string }> = [
  { type: "bar", label: "Bar" },
  { type: "horizontal-bar", label: "H-Bar" },
  { type: "stacked-bar", label: "Stacked" },
  { type: "line", label: "Line" },
  { type: "area", label: "Area" },
  { type: "multi-line", label: "Multi-line" },
  { type: "pie", label: "Pie" },
  { type: "donut", label: "Donut" },
  { type: "scatter", label: "Scatter" },
  { type: "heatmap", label: "Heatmap" },
  { type: "treemap", label: "Treemap" },
  { type: "radar", label: "Radar" },
  { type: "funnel", label: "Funnel" },
];

export const AGGREGATES: Array<{ value: AggregateFn; label: string }> = [
  { value: "none", label: "Raw" },
  { value: "count", label: "Count" },
  { value: "sum", label: "Sum" },
  { value: "avg", label: "Average" },
  { value: "median", label: "Median" },
  { value: "min", label: "Min" },
  { value: "max", label: "Max" },
  { value: "distinct", label: "Distinct" },
];

export const FILTER_OPS: FilterDef["op"][] = [
  "=",
  "!=",
  ">",
  "<",
  ">=",
  "<=",
  "LIKE",
  "IN",
  "BETWEEN",
  "NOT NULL",
  "IS NULL",
];

export const PALETTE = [
  "#a78bfa",
  "#60a5fa",
  "#34d399",
  "#fbbf24",
  "#f472b6",
  "#22d3ee",
  "#fb923c",
  "#a3e635",
  "#f87171",
  "#c084fc",
  "#818cf8",
  "#f9a8d4",
];
