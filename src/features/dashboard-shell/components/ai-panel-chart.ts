import {
  buildBarOption,
  buildLineOption,
  buildPieOption,
  buildScatterOption,
  type EChartsOption,
} from "@/platform/viz";

export interface AiQueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  durationMs: number;
}

const CHART_COLORS = ["#60a5fa", "#34d399", "#f472b6", "#fbbf24", "#a78bfa", "#2dd4bf"];

/**
 * Map a read-only query result + the NLQ chart suggestion onto a platform
 * ECharts option built with the shared `@/platform/viz` builders.
 *
 * This replaces the bespoke ~180-line `buildChartFromResult` that hand-rolled
 * raw ECharts option objects in the render path; the option now comes from the
 * same builders the chart worker consumes, and the chart itself is rendered via
 * `<OffscreenChart>` off the main thread.
 */
export function buildAiChartOption(
  result: AiQueryResult,
  suggestion: string,
): EChartsOption | null {
  const { columns, rows } = result;
  if (rows.length === 0 || columns.length < 2) return null;

  if (suggestion === "pie") {
    const [nameCol, valueCol] = columns;
    return buildPieOption(
      rows.map((row) => ({
        name: String(row[nameCol] ?? ""),
        value: Number(row[valueCol] ?? 0),
      })),
      { donut: true },
    );
  }

  if (suggestion === "scatter") {
    const [xCol, yCol] = columns;
    return buildScatterOption([
      {
        name: `${xCol} × ${yCol}`,
        points: rows.map(
          (row) => [Number(row[xCol] ?? 0), Number(row[yCol] ?? 0)] as [number, number],
        ),
        color: CHART_COLORS[0],
      },
    ]);
  }

  const [categoryCol, ...valueCols] = columns;
  const categories = rows.map((row) => String(row[categoryCol] ?? ""));
  const series = valueCols.map((col, index) => ({
    name: col,
    data: rows.map((row) => Number(row[col] ?? 0)),
    color: CHART_COLORS[index % CHART_COLORS.length],
  }));

  if (suggestion === "line") {
    return buildLineOption(categories, series);
  }

  // Default + explicit "bar".
  return buildBarOption(categories, series);
}
