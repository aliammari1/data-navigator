"use client";

import ReactEChartsCore from "echarts-for-react/lib/core";
import type { CSSProperties } from "react";
import { echarts } from "@/platform/viz/echarts-core";
import { OffscreenChart, supportsOffscreenChart } from "@/platform/viz";

type EChartsEventHandler = (params: Record<string, unknown>) => void;

interface TheaterChartProps {
  option: Record<string, unknown>;
  /** Pixel height of the chart surface. */
  height?: number;
  style?: CSSProperties;
  /**
   * Force a full re-init instead of an incremental merge. Use sparingly — most
   * scenes update by merging the new option, preserving ECharts' transitions.
   */
  notMerge?: boolean;
  lazyUpdate?: boolean;
  /**
   * Interaction handlers (e.g. sunburst drill-down). When provided we render the
   * in-thread `echarts-for-react` surface because the OffscreenCanvas worker only
   * forwards pointer tooltips, not arbitrary click events.
   */
  onEvents?: Record<string, EChartsEventHandler>;
}

/**
 * Single chart surface for the theater. Heavy, non-interactive charts render off
 * the main thread via the shared `OffscreenChart` worker; interactive charts (or
 * environments without OffscreenCanvas) fall back to `echarts-for-react`
 * bound to the SAME tree-shaken `echarts/core` instance (never the full build),
 * keeping the route chunk small.
 */
export function TheaterChart({
  option,
  height = 360,
  style,
  notMerge,
  lazyUpdate = true,
  onEvents,
}: TheaterChartProps) {
  const resolvedStyle: CSSProperties = style ?? { height, width: "100%" };

  const fallback = (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      notMerge={notMerge}
      lazyUpdate={lazyUpdate}
      style={resolvedStyle}
      onEvents={onEvents}
    />
  );

  // Interactive charts and unsupported environments use the in-thread surface.
  if (onEvents || !supportsOffscreenChart()) {
    return fallback;
  }

  return (
    <OffscreenChart
      option={option as Parameters<typeof OffscreenChart>[0]["option"]}
      height={height}
      fallback={fallback}
    />
  );
}
