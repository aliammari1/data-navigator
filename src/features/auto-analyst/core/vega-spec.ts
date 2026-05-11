"use client";
/**
 * Tiny set of Vega-Lite spec builders. Outputs JSON specs ready for react-vega.
 * The Visualiser agent emits these; users can edit them in the Vega editor.
 */

import type { TopLevelSpec } from "vega-lite";

const DARK_THEME = {
  background: "transparent",
  config: {
    view: { stroke: "transparent" },
    axis: {
      labelColor: "#94a3b8",
      titleColor: "#cbd5e1",
      gridColor: "#1e293b",
      domainColor: "#1e293b",
      tickColor: "#1e293b",
    },
    legend: { labelColor: "#cbd5e1", titleColor: "#cbd5e1" },
    title: { color: "#e2e8f0" },
  },
};

export function buildBar(
  data: Record<string, unknown>[],
  x: string,
  y: string,
  agg: "sum" | "mean" | "count" | "median" | "max" | "min" = "sum",
  color?: string,
): TopLevelSpec {
  return {
    ...DARK_THEME,
    data: { values: data },
    mark: { type: "bar", cornerRadiusEnd: 3 },
    encoding: {
      x: { field: x, type: "nominal", sort: "-y" },
      y: { field: y, type: "quantitative", aggregate: agg },
      ...(color ? { color: { field: color, type: "nominal" } } : {}),
      tooltip: [
        { field: x, type: "nominal" },
        { field: y, type: "quantitative", aggregate: agg },
      ],
    },
  };
}

export function buildLine(
  data: Record<string, unknown>[],
  x: string,
  y: string,
  color?: string,
): TopLevelSpec {
  return {
    ...DARK_THEME,
    data: { values: data },
    mark: { type: "line", point: true, interpolate: "monotone" },
    encoding: {
      x: { field: x, type: "temporal" },
      y: { field: y, type: "quantitative", aggregate: "sum" },
      ...(color ? { color: { field: color, type: "nominal" } } : {}),
      tooltip: [
        { field: x, type: "temporal" },
        { field: y, type: "quantitative", aggregate: "sum" },
      ],
    },
  };
}

export function buildScatter(
  data: Record<string, unknown>[],
  x: string,
  y: string,
  color?: string,
): TopLevelSpec {
  return {
    ...DARK_THEME,
    data: { values: data },
    mark: { type: "circle", opacity: 0.7, size: 60 },
    encoding: {
      x: { field: x, type: "quantitative" },
      y: { field: y, type: "quantitative" },
      ...(color ? { color: { field: color, type: "nominal" } } : {}),
      tooltip: [
        { field: x, type: "quantitative" },
        { field: y, type: "quantitative" },
      ],
    },
  };
}

export function buildHistogram(
  data: Record<string, unknown>[],
  field: string,
): TopLevelSpec {
  return {
    ...DARK_THEME,
    data: { values: data },
    mark: { type: "bar", cornerRadiusEnd: 2 },
    encoding: {
      x: { field, type: "quantitative", bin: { maxbins: 30 } },
      y: { aggregate: "count", type: "quantitative" },
    },
  };
}

export function buildHeatmap(
  data: Record<string, unknown>[],
  x: string,
  y: string,
  metric: string,
): TopLevelSpec {
  return {
    ...DARK_THEME,
    data: { values: data },
    mark: { type: "rect" },
    encoding: {
      x: { field: x, type: "nominal" },
      y: { field: y, type: "nominal" },
      color: {
        field: metric,
        type: "quantitative",
        aggregate: "sum",
        scale: { scheme: "purples" },
      },
      tooltip: [
        { field: x, type: "nominal" },
        { field: y, type: "nominal" },
        { field: metric, type: "quantitative", aggregate: "sum" },
      ],
    },
  };
}

export function buildBoxplot(
  data: Record<string, unknown>[],
  x: string,
  y: string,
): TopLevelSpec {
  return {
    ...DARK_THEME,
    data: { values: data },
    mark: { type: "boxplot", extent: 1.5 },
    encoding: {
      x: { field: x, type: "nominal" },
      y: { field: y, type: "quantitative" },
    },
  };
}

export function buildDensity(
  data: Record<string, unknown>[],
  field: string,
): TopLevelSpec {
  return {
    ...DARK_THEME,
    data: { values: data },
    transform: [{ density: field, bandwidth: 0.3 }],
    mark: { type: "area", opacity: 0.6 },
    encoding: {
      x: { field: "value", type: "quantitative", title: field },
      y: { field: "density", type: "quantitative" },
    },
  };
}
