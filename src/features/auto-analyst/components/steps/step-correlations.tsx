"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { CorrelationCell } from "@/features/auto-analyst/core/types";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

export function StepCorrelations({ cells }: { cells: CorrelationCell[] }) {
  const { vars, matrix } = useMemo(() => {
    const v = [...new Set(cells.flatMap((c) => [c.a, c.b]))];
    const m = v.map((row) =>
      v.map((col) => {
        const hit = cells.find(
          (c) => (c.a === row && c.b === col) || (c.a === col && c.b === row),
        );
        return hit?.r ?? 0;
      }),
    );
    return { vars: v, matrix: m };
  }, [cells]);

  const option = useMemo(
    () => ({
      backgroundColor: "transparent",
      tooltip: {
        position: "top",
        backgroundColor: "#1e1e2e",
        borderColor: "#ffffff12",
        textStyle: { color: "#cdd6f4", fontSize: 11 },
      },
      grid: { top: 32, right: 60, bottom: 60, left: 80 },
      xAxis: {
        type: "category",
        data: vars,
        axisLabel: { color: "#94a3b8", fontSize: 10, rotate: 35 },
      },
      yAxis: {
        type: "category",
        data: vars,
        axisLabel: { color: "#94a3b8", fontSize: 10 },
      },
      visualMap: {
        min: -1,
        max: 1,
        calculable: true,
        orient: "vertical",
        right: 10,
        top: "center",
        textStyle: { color: "#94a3b8", fontSize: 9 },
        inRange: { color: ["#f43f5e", "#1e1e2e", "#10b981"] },
      },
      series: [
        {
          type: "heatmap",
          data: matrix.flatMap((row, i) =>
            row.map((v, j) => [j, i, Number(v.toFixed(3))]),
          ),
          label: {
            show: true,
            color: "#e2e8f0",
            fontSize: 10,
            formatter: (p: { value: number[] }) => p.value[2].toFixed(2),
          },
          emphasis: { itemStyle: { borderColor: "#fff", borderWidth: 1 } },
        },
      ],
    }),
    [vars, matrix],
  );

  if (!vars.length)
    return (
      <p className="text-sm text-(--atlas-text-subtle)">
        Need at least 2 numeric columns to compute correlations.
      </p>
    );

  const top = [...cells]
    .filter((c) => c.a !== c.b)
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
    .slice(0, 5);

  return (
    <div className="space-y-3">
      <div className="rounded-(--atlas-radius-3) border border-(--atlas-border) bg-(--atlas-surface) p-2">
        <ReactECharts
          option={option}
          style={{ height: 320 }}
          opts={{ renderer: "canvas" }}
        />
      </div>
      {top.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {top.map((c) => (
            <div
              key={`${c.a}-${c.b}`}
              className="rounded-(--atlas-radius-2) border border-(--atlas-border) bg-(--atlas-surface) px-3 py-2 flex items-center justify-between"
            >
              <span className="text-xs text-(--atlas-text)">
                {c.a} ↔ {c.b}
              </span>
              <span
                className={`text-sm font-mono tabular-nums font-semibold ${
                  Math.abs(c.r) >= 0.7
                    ? c.r > 0
                      ? "text-(--atlas-success-fg)"
                      : "text-(--atlas-danger-fg)"
                    : "text-(--atlas-text)"
                }`}
              >
                r = {c.r.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
