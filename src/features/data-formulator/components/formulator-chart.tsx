"use client";

/**
 * FormulatorChart — the single rendering surface for every chart card in the
 * Data Formulator (bento grid + infinite canvas).
 *
 * Routing by mark + density (matches the feature plan §2.5 / §4-F):
 *   - Dense line / area / multi-line  → uPlot (Canvas 2D, ~10% CPU on the
 *     medium-end target; far cheaper than ECharts for thousands of points).
 *   - Everything else (bar, pie, scatter, heatmap, treemap, …) → ECharts in an
 *     OffscreenCanvas Web Worker via `<OffscreenChart>`, so option build + paint
 *     stay OFF the renderer main thread. Falls back to `echarts-for-react` bound
 *     to the tree-shaken `echarts/core` when OffscreenCanvas/Worker is missing.
 *
 * Export is handled by callers via the chart proxy's `getDataURL` /
 * `renderToSVGString` — never DOM screenshots.
 */

import ReactEChartsCore from "echarts-for-react/lib/core";
import { useMemo } from "react";
import {
  buildTimeSeriesOptions,
  type EChartsOption,
  OffscreenChart,
  supportsOffscreenChart,
  toAlignedData,
  useUPlot,
} from "@/platform/viz";
import { echarts } from "@/platform/viz/echarts-core";
import { PALETTE } from "../core/constants";
import { buildOption } from "../core/chart-options";
import type { ChartSpec, QueryResult } from "../core/types";

/** Point count above which a line/area series is "dense" and routed to uPlot. */
const UPLOT_DENSITY_THRESHOLD = 120;

const DENSE_LINE_TYPES = new Set<ChartSpec["type"]>(["line", "area"]);

function isDenseLine(spec: ChartSpec, rowCount: number): boolean {
  return DENSE_LINE_TYPES.has(spec.type) && rowCount >= UPLOT_DENSITY_THRESHOLD;
}

// ─── uPlot dense time-series path ──────────────────────────────────────────────

function UPlotLine({
  spec,
  data,
  height,
}: {
  spec: ChartSpec;
  data: Record<string, unknown>[];
  height: number;
}) {
  // x is treated as an ordinal index (0..n) so this works for both temporal and
  // categorical x; values come straight from the SQL-shaped x_val/y_val aliases.
  const { aligned, opts } = useMemo(() => {
    const xs = new Float64Array(data.length);
    const ys = new Float64Array(data.length);
    for (let i = 0; i < data.length; i++) {
      xs[i] = i;
      ys[i] = Number(data[i]?.y_val ?? 0);
    }
    const options = buildTimeSeriesOptions(
      600,
      height,
      [
        {
          label: spec.title || "Value",
          stroke: PALETTE[0],
          fill: spec.type === "area" ? `${PALETTE[0]}33` : undefined,
          width: 2,
        },
      ],
      { time: false, dragX: true },
    );
    return { aligned: toAlignedData(xs, [ys]), opts: options };
  }, [data, height, spec.title, spec.type]);

  const ref = useUPlot(opts, aligned);
  return <div ref={ref} style={{ width: "100%", height }} />;
}

// ─── ECharts (offscreen) path ──────────────────────────────────────────────────

export interface FormulatorChartProps {
  spec: ChartSpec;
  result: QueryResult | null | undefined;
  height: number;
  className?: string;
}

export function FormulatorChart({
  spec,
  result,
  height,
  className,
}: FormulatorChartProps) {
  const data = result?.data ?? [];

  const option = useMemo(
    () => (data.length ? buildOption(spec, data) : null),
    [spec, data],
  );

  if (data.length === 0 || !option) return null;

  if (isDenseLine(spec, data.length)) {
    return <UPlotLine spec={spec} data={data} height={height} />;
  }

  const echartsOption = option as EChartsOption;
  const fallback = (
    <ReactEChartsCore
      echarts={echarts}
      option={echartsOption}
      style={{ height, width: "100%" }}
      lazyUpdate
    />
  );

  if (!supportsOffscreenChart()) return fallback;

  return (
    <OffscreenChart
      option={echartsOption}
      height={height}
      className={className}
      fallback={fallback}
    />
  );
}
