"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { ForecastSeries } from "@/features/auto-analyst/core/types";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return Number.isInteger(n) ? n.toString() : n.toFixed(2);
}

function ForecastPanel({ series }: { series: ForecastSeries }) {
  const option = useMemo(() => {
    const histPoints = series.history.map((p) => [p.t, p.y]);
    const fcPoints = series.forecast.map((p) => [p.t, p.yhat]);
    const upper95 = series.forecast.map((p) => [p.t, p.yHigh95]);
    const lower95 = series.forecast.map((p) => [p.t, p.yLow95]);
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "#1e1e2e",
        borderColor: "#ffffff12",
        textStyle: { color: "#cdd6f4", fontSize: 11 },
      },
      legend: {
        textStyle: { color: "#94a3b8", fontSize: 10 },
        top: 0,
      },
      grid: { top: 32, right: 16, bottom: 28, left: 12, containLabel: true },
      xAxis: {
        type: "time",
        axisLabel: { color: "#94a3b8", fontSize: 10 },
        axisLine: { lineStyle: { color: "#1e293b" } },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#94a3b8", fontSize: 10, formatter: fmt },
        splitLine: { lineStyle: { color: "#1e293b" } },
      },
      series: [
        {
          name: "Confidence (95%)",
          type: "line",
          data: upper95,
          lineStyle: { opacity: 0 },
          stack: "band",
          symbol: "none",
          showSymbol: false,
        },
        {
          name: "Lower",
          type: "line",
          data: lower95.map((p, i) => [p[0], p[1] - upper95[i][1]]),
          lineStyle: { opacity: 0 },
          areaStyle: { color: "rgba(167, 139, 250, 0.15)" },
          stack: "band",
          symbol: "none",
          showSymbol: false,
        },
        {
          name: "History",
          type: "line",
          data: histPoints,
          smooth: true,
          symbol: "circle",
          symbolSize: 4,
          lineStyle: { color: "#a78bfa", width: 2.5 },
          itemStyle: { color: "#a78bfa" },
        },
        {
          name: "Forecast",
          type: "line",
          data: fcPoints,
          smooth: true,
          symbol: "none",
          lineStyle: { color: "#f472b6", width: 2, type: "dashed" },
        },
      ],
    };
  }, [series]);

  const lastY = series.history[series.history.length - 1]?.y ?? 0;
  const nextY = series.forecast[series.forecast.length - 1]?.yhat ?? lastY;
  const pct = lastY === 0 ? 0 : ((nextY - lastY) / Math.abs(lastY)) * 100;

  return (
    <div className="rounded-(--atlas-radius-3) border border-(--atlas-border) bg-(--atlas-surface) p-3">
      <div className="flex items-baseline justify-between mb-2">
        <h4 className="text-sm font-semibold text-(--atlas-text)">
          {series.column}
        </h4>
        <span
          className={`text-xs font-semibold tabular-nums ${
            pct > 0
              ? "text-(--atlas-success-fg)"
              : pct < 0
                ? "text-(--atlas-danger-fg)"
                : "text-(--atlas-text-muted)"
          }`}
        >
          {pct >= 0 ? "+" : ""}
          {pct.toFixed(1)}% over horizon
        </span>
      </div>
      <ReactECharts
        option={option}
        style={{ height: 240 }}
        opts={{ renderer: "canvas" }}
      />
    </div>
  );
}

export function StepForecast({ series }: { series: ForecastSeries[] }) {
  if (!series.length)
    return (
      <p className="text-sm text-(--atlas-text-subtle)">
        No time-series detected. Need a datetime column + numeric metric.
      </p>
    );
  return (
    <div className="space-y-3">
      {series.map((s) => (
        <ForecastPanel key={s.column} series={s} />
      ))}
    </div>
  );
}
