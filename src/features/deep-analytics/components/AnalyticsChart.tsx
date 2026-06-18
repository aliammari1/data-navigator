"use client";

import ReactEChartsCore from "echarts-for-react/lib/core";
import { memo } from "react";
import { type EChartsOption, echarts, OffscreenChart } from "@/platform/viz";

interface AnalyticsChartProps {
  option: Record<string, unknown>;
  height?: number;
}

/**
 * Deep-analytics chart surface.
 *
 * Renders the ECharts option **off the main thread** via `<OffscreenChart>`
 * (chart.worker + a transferred OffscreenCanvas). When OffscreenCanvas/Worker is
 * unavailable, it falls back to `echarts-for-react` using the SAME tree-shaken
 * `echarts` core from the platform (never the full build) so the bundle stays
 * lean and rendering stays consistent.
 *
 * Memoised so a parent re-render with an unchanged (memoised) option object does
 * not trigger a redraw.
 */
function AnalyticsChartBase({ option, height = 300 }: AnalyticsChartProps) {
  const opt = option as EChartsOption;
  return (
    <OffscreenChart
      option={opt}
      height={height}
      theme="dark"
      fallback={
        <ReactEChartsCore
          echarts={echarts}
          option={opt}
          style={{ height }}
          theme="dark"
          notMerge={false}
          lazyUpdate
          opts={{ renderer: "canvas" }}
        />
      }
    />
  );
}

export const AnalyticsChart = memo(AnalyticsChartBase);
