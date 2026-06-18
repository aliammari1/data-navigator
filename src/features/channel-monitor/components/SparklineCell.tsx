"use client";

/**
 * Tiny inline success-rate sparkline rendered with uPlot (main-thread Canvas 2D,
 * ~10% CPU vs ECharts 70%). Used per channel card so live trends are dense and
 * cheap. Options are built once per instance; data updates stream via setData.
 */

import { useMemo } from "react";
import { buildSparklineOptions, toAlignedData, useUPlot } from "@/platform/viz";

export function SparklineCell({
  values,
  stroke = "#6366f1",
  width = 120,
  height = 28,
}: {
  values: number[];
  stroke?: string;
  width?: number;
  height?: number;
}) {
  // x is a synthetic index axis (time:false in sparkline options).
  const data = useMemo(() => {
    const x = new Float64Array(values.length);
    for (let i = 0; i < values.length; i++) x[i] = i;
    return toAlignedData(x, [Float64Array.from(values)]);
  }, [values]);

  const opts = useMemo(
    () => buildSparklineOptions(width, height, stroke),
    [width, height, stroke],
  );

  const ref = useUPlot(opts, data);

  if (values.length < 2) {
    return <div style={{ width, height }} className="rounded bg-slate-800/40" />;
  }
  return <div ref={ref} style={{ width, height }} />;
}
