"use client";

// ─── AnalysisChart ────────────────────────────────────────────────────────────
//
// Heavy, non-interactive ECharts surfaces (heatmap, scatter, pie, histogram)
// rendered OFF the main thread via the shared `OffscreenChart` worker. When
// OffscreenCanvas/Worker is unavailable, falls back to `echarts-for-react` bound
// to the SAME tree-shaken `echarts/core` instance (never the full build), so the
// route chunk stays small and the feature still works on every target.

import ReactEChartsCore from "echarts-for-react/lib/core";
import { echarts } from "@/platform/viz/echarts-core";
import { type EChartsOption, OffscreenChart, supportsOffscreenChart } from "@/platform/viz";

export interface AnalysisChartProps {
  option: EChartsOption;
  height: number;
  className?: string;
}

export function AnalysisChart({ option, height, className }: AnalysisChartProps) {
  const fallback = (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      style={{ height, width: "100%" }}
      lazyUpdate
    />
  );

  if (!supportsOffscreenChart()) return fallback;

  return (
    <OffscreenChart option={option} height={height} className={className} fallback={fallback} />
  );
}
