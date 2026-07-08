"use client";

// ─── ForecastChart (uPlot, dense main-thread Canvas) ──────────────────────────
//
// The forecast/actual series can be long (≤120 monthly points + horizon, or up to
// ~200 reservoir-sampled index points). uPlot renders these at ~10% of the CPU of
// a canvas ECharts pipeline, so the forecast tab stays smooth on an iGPU. We draw
// four series — confidence lower/upper (filled band), actual, and predicted —
// using uPlot's native `bands` to shade the 95% CI between the two bound series.

import type uPlot from "uplot";
import { useMemo } from "react";
import { toAlignedData, useUPlot } from "@/platform/viz";
import type { ForecastPoint } from "@/features/ai-analysis/model/types";

export interface ForecastChartProps {
  points: ForecastPoint[];
  height?: number;
}

export function ForecastChart({ points, height = 320 }: ForecastChartProps) {
  const { opts, data } = useMemo(() => {
    const n = points.length;
    const x = new Float64Array(n);
    const lower = new Float64Array(n);
    const upper = new Float64Array(n);
    const actual = new Float64Array(n);
    const predicted = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const p = points[i];
      x[i] = i;
      lower[i] = p.lower;
      upper[i] = p.upper;
      actual[i] = p.actual ?? Number.NaN;
      predicted[i] = p.predicted;
    }

    const options: uPlot.Options = {
      width: 800,
      height,
      // Index axis — we relabel ticks to the period strings below.
      scales: { x: { time: false }, y: { auto: true } },
      series: [
        {
          value: (_self, raw) => {
            const idx = Math.round(raw as number);
            return points[idx]?.period.replace(" (forecast)", "") ?? "";
          },
        },
        // Series 1 = lower bound (hidden line, used as band floor).
        { label: "CI lower", stroke: "transparent", points: { show: false } },
        // Series 2 = upper bound (band ceiling).
        {
          label: "95% CI",
          stroke: "rgba(99,102,241,0.35)",
          fill: "rgba(99,102,241,0.12)",
          width: 1,
          points: { show: false },
        },
        // Series 3 = actual.
        {
          label: "Actual",
          stroke: "#22c55e",
          width: 2,
          points: { show: true, size: 4 },
        },
        // Series 4 = predicted.
        {
          label: "Predicted",
          stroke: "#6366f1",
          width: 2,
          dash: [6, 4],
          points: { show: false },
        },
      ],
      // Shade the 95% CI between upper (series 2) and lower (series 1).
      bands: [{ series: [2, 1], fill: "rgba(99,102,241,0.12)" }],
      axes: [
        {
          stroke: "#94a3b8",
          values: (_self, splits) =>
            splits.map((s) => points[Math.round(s)]?.period.replace(" (forecast)", "") ?? ""),
          rotate: -30,
          size: 50,
        },
        { stroke: "#94a3b8" },
      ],
      cursor: { drag: { x: true, y: false } },
      legend: { show: true },
    };

    return {
      opts: options,
      data: toAlignedData(x, [lower, upper, actual, predicted]),
    };
    // height is the only stable input besides points; rebuild when points change.
  }, [points, height]);

  const ref = useUPlot(opts, data);
  return <div ref={ref} style={{ width: "100%", height }} />;
}
