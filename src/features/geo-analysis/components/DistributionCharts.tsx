"use client";

/**
 * DistributionCharts
 *
 * Renders the channel/region heatmap and the per-region donut from real DuckDB
 * aggregates. ECharts is loaded via `next/dynamic` against a tree-shaken core
 * build (heatmap + pie only), replacing the previous `useEffect`+`setState`
 * loader that shipped the full ~1MB bundle and flashed "Loading chart…".
 */

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { ChannelMatrix } from "../hooks/use-geo-data";

const ReactECharts = dynamic(
  async () => {
    const [{ default: Core }, { default: echarts }] = await Promise.all([
      import("echarts-for-react/lib/core"),
      import("../lib/echarts-core"),
    ]);
    // Bind the tree-shaken echarts instance to the core renderer once.
    return function BoundECharts(props: {
      option: unknown;
      style?: React.CSSProperties;
      onEvents?: Record<string, unknown>;
    }) {
      return (
        <Core
          echarts={echarts}
          option={props.option as never}
          style={props.style}
          onEvents={props.onEvents as never}
          notMerge
          lazyUpdate
        />
      );
    };
  },
  {
    ssr: false,
    loading: () => (
      <div className="flex h-96 items-center justify-center text-sm text-muted-foreground">
        Loading chart…
      </div>
    ),
  },
);

export interface HeatmapChartProps {
  matrix: ChannelMatrix;
  onSelectRegion: (regionIndex: number) => void;
  height?: number;
}

export function HeatmapChart({ matrix, onSelectRegion, height = 420 }: HeatmapChartProps) {
  const option = useMemo(() => {
    const data: [number, number, number][] = [];
    let max = 0;
    matrix.shares.forEach((row, ri) => {
      row.forEach((val, ci) => {
        const v = Math.round(val * 10) / 10;
        data.push([ci, ri, v]);
        if (v > max) max = v;
      });
    });
    return {
      tooltip: {
        trigger: "item" as const,
        formatter: (params: { value: [number, number, number] }) => {
          const [ci, ri, val] = params.value;
          const count = matrix.counts[ri]?.[ci] ?? 0;
          return `${matrix.regions[ri]} — ${matrix.channels[ci]}<br/><b>${val.toFixed(
            1,
          )}%</b> · ${count.toLocaleString("fr-FR")} tx`;
        },
      },
      grid: { top: 50, bottom: 90, left: 130, right: 40 },
      xAxis: {
        type: "category" as const,
        data: matrix.channels,
        splitArea: { show: true },
        axisLabel: { rotate: 38, fontSize: 11 },
      },
      yAxis: {
        type: "category" as const,
        data: matrix.regions,
        splitArea: { show: true },
        axisLabel: { fontSize: 11 },
      },
      visualMap: {
        min: 0,
        max: Math.max(10, Math.ceil(max)),
        calculable: true,
        orient: "horizontal" as const,
        left: "center" as const,
        bottom: 0,
        inRange: { color: ["#1e3a5f", "#1d4ed8", "#60a5fa", "#93c5fd", "#dbeafe"] },
      },
      series: [
        {
          name: "Channel Share",
          type: "heatmap" as const,
          data,
          label: {
            show: matrix.regions.length * matrix.channels.length <= 160,
            formatter: (params: { value: [number, number, number] }) =>
              params.value[2] >= 1 ? `${params.value[2].toFixed(0)}%` : "",
            fontSize: 10,
          },
          progressive: 400,
          emphasis: { itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,.5)" } },
        },
      ],
    };
  }, [matrix]);

  const events = useMemo(
    () => ({
      click: (params: { value: [number, number, number] }) => {
        onSelectRegion(params.value[1]);
      },
    }),
    [onSelectRegion],
  );

  return (
    <ReactECharts option={option} style={{ height }} onEvents={events as Record<string, unknown>} />
  );
}

export interface RegionPieProps {
  matrix: ChannelMatrix;
  regionIndex: number;
  height?: number;
}

export function RegionPie({ matrix, regionIndex, height = 220 }: RegionPieProps) {
  const option = useMemo(() => {
    const row = matrix.shares[regionIndex] ?? [];
    return {
      tooltip: { trigger: "item" as const },
      legend: { bottom: 0, type: "scroll" as const, textStyle: { fontSize: 10 } },
      series: [
        {
          type: "pie" as const,
          radius: ["35%", "65%"],
          data: matrix.channels
            .map((channel, ci) => ({
              name: channel,
              value: Math.round((row[ci] ?? 0) * 10) / 10,
            }))
            .filter((d) => d.value > 0),
          label: { fontSize: 10 },
        },
      ],
    };
  }, [matrix, regionIndex]);

  return <ReactECharts option={option} style={{ height }} />;
}
