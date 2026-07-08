"use client";

// ─── CatalogChart ─────────────────────────────────────────────────────────────
//
// Stats-tab ECharts surfaces (storage-by-folder donut, files-by-type bar)
// rendered OFF the main thread via the shared `OffscreenChart` worker. When
// OffscreenCanvas/Worker is unavailable, falls back to `echarts-for-react`
// bound to the SAME tree-shaken `echarts/core` instance — never the full
// `echarts-for-react` default bundle the old monolith imported. This keeps the
// folders/stats route chunk small while the feature still works everywhere.

import ReactEChartsCore from "echarts-for-react/lib/core";
import { type EChartsOption, OffscreenChart, supportsOffscreenChart } from "@/platform/viz";
import { echarts } from "@/platform/viz/echarts-core";

export interface CatalogChartProps {
  option: EChartsOption;
  height: number;
  className?: string;
}

export function CatalogChart({ option, height, className }: CatalogChartProps) {
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
