"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { fmtN } from "@/features/telecom/lib/format";
import { SceneShell } from "../components/SceneShell";
import { TheaterChart } from "../components/TheaterChart";
import { useSceneData } from "../hooks/use-scene-data";
import { asNum, asStr, buildGanttSql } from "../lib/queries";
import { AXIS_LINE, TEXT_COLOR, TOOLTIP_BG, TOOLTIP_BORDER } from "../lib/theme";

const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);

/**
 * Shape per-(category, hour) rows into an ECharts heatmap matrix. Each cell is
 * the aggregated measure for that category at that hour-of-day — an honest
 * "when is each category busiest" intensity grid.
 */
function buildMatrix(rows: Record<string, unknown>[]): {
  categories: string[];
  data: [number, number, number][];
  max: number;
} {
  const categories: string[] = [];
  const catIndex = new Map<string, number>();
  const data: [number, number, number][] = [];
  let max = 0;
  for (const row of rows) {
    const cat = asStr(row.cat);
    const hour = Math.trunc(asNum(row.hour));
    const v = asNum(row.v);
    if (!cat || hour < 0 || hour > 23) continue;
    let ci = catIndex.get(cat);
    if (ci === undefined) {
      ci = categories.length;
      catIndex.set(cat, ci);
      categories.push(cat);
    }
    data.push([hour, ci, v]);
    if (v > max) max = v;
  }
  return { categories, data, max };
}

export default function GanttScene() {
  const scene = useSceneData(buildGanttSql);

  const { categories, data, max } = useMemo(() => buildMatrix(scene.rows), [scene.rows]);

  const option = useMemo(
    () => ({
      backgroundColor: "transparent",
      tooltip: {
        position: "top" as const,
        backgroundColor: TOOLTIP_BG,
        borderColor: TOOLTIP_BORDER,
        textStyle: { color: TEXT_COLOR, fontSize: 12 },
        formatter: (p: { data: [number, number, number] }) => {
          const [hour, ci, v] = p.data;
          return `<b>${categories[ci] ?? ""}</b><br/>${HOURS[hour]}<br/>${fmtN(v)}`;
        },
      },
      grid: { top: 10, left: 120, right: 24, bottom: 60, containLabel: false },
      xAxis: {
        type: "category" as const,
        data: HOURS,
        splitArea: { show: true },
        axisLabel: { color: TEXT_COLOR, fontSize: 9, interval: 1 },
        axisLine: AXIS_LINE,
      },
      yAxis: {
        type: "category" as const,
        data: categories,
        splitArea: { show: true },
        axisLabel: { color: TEXT_COLOR, fontSize: 10 },
        axisLine: AXIS_LINE,
      },
      visualMap: {
        min: 0,
        max: max || 1,
        calculable: true,
        orient: "horizontal" as const,
        left: "center" as const,
        bottom: 6,
        inRange: {
          color: ["#0d1117", "#0e4429", "#006d32", "#26a641", "#39d353"],
        },
        textStyle: { color: TEXT_COLOR, fontSize: 11 },
      },
      series: [
        {
          type: "heatmap" as const,
          data,
          emphasis: {
            itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.5)" },
          },
          progressive: 1000,
          progressiveThreshold: 3000,
        },
      ],
    }),
    [categories, data, max],
  );

  return (
    <SceneShell
      isLoading={scene.isLoading}
      error={scene.error}
      unsupported={scene.unsupported}
      unsupportedHint="Add a dataset with a timestamp column and a categorical column to map hourly activity."
      isEmpty={scene.isEmpty || data.length === 0}
      onRetry={scene.refetch}
    >
      <div className="space-y-4">
        {scene.note && <p className="text-xs text-muted-foreground">{scene.note}</p>}
        <Card>
          <CardContent className="pt-4">
            <TheaterChart option={option} height={Math.max(280, categories.length * 34 + 90)} />
          </CardContent>
        </Card>
      </div>
    </SceneShell>
  );
}
