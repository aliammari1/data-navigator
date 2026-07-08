/**
 * Cross-filter resolution — the pure decision behind "click a bar to filter".
 *
 * An ECharts click on a categorical chart carries the clicked category as
 * `params.name` (the compiled option maps every x value to that field via
 * `x_val`). This module turns such a click into a (field, value) toggle the
 * shelf can apply, but ONLY for chart types whose `params.name` really is the
 * x-axis category — scatter/bubble/heatmap/radar clicks carry a series or cell
 * identity instead, so filtering the x field on them would lie.
 *
 * Kept framework-free (no React, no store) so the mapping is unit-testable in
 * isolation; the chart canvas wires the result to `toggleValueFilter`.
 */

/** Chart types whose click `params.name` is the categorical x value. */
export const CROSS_FILTERABLE_CHART_TYPES: ReadonlySet<string> = new Set([
  "bar",
  "horizontal-bar",
  "stacked-bar",
  "stacked-horizontal-bar",
  "line",
  "area",
  "multi-line",
  "pie",
  "donut",
  "treemap",
  "funnel",
]);

/** Minimal shape of the ECharts click event params we read. */
export interface ChartClickParams {
  name?: unknown;
}

export interface CrossFilterTarget {
  field: string;
  value: string;
}

/**
 * Resolve a chart click into a cross-filter toggle target, or `null` when the
 * click isn't a categorical x selection we can safely filter on (no x field
 * bound, a non-categorical chart type, or an empty/non-string category).
 */
export function resolveCrossFilter(
  params: ChartClickParams | null | undefined,
  xField: string | null | undefined,
  chartType: string | null | undefined,
): CrossFilterTarget | null {
  if (!xField) return null;
  if (!chartType || !CROSS_FILTERABLE_CHART_TYPES.has(chartType)) return null;
  const name = typeof params?.name === "string" ? params.name.trim() : "";
  if (!name) return null;
  return { field: xField, value: name };
}
