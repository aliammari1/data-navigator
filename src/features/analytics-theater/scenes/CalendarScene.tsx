"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDuckDBQuery } from "@/core/queries/duckdb";
import { fmtCompact, fmtN } from "@/features/telecom/lib/format";
import { SceneShell } from "../components/SceneShell";
import { TheaterChart } from "../components/TheaterChart";
import { buildCalendarSql } from "../lib/queries";
import { asNum, asStr } from "../lib/queries";
import { TEXT_COLOR, TOOLTIP_BG, TOOLTIP_BORDER } from "../lib/theme";
import { useActiveDataset } from "../lib/use-active-dataset";

interface DayPoint {
  date: string;
  value: number;
  year: number;
}

interface CalendarStats {
  total: number;
  avg: number;
  max: number;
  min: number;
  best: DayPoint | null;
  worst: DayPoint | null;
  streak: number;
}

/** Single-pass derivation of calendar KPIs (no `Math.max(...spread)`). */
function computeStats(points: DayPoint[]): CalendarStats {
  if (points.length === 0) {
    return {
      total: 0,
      avg: 0,
      max: 0,
      min: 0,
      best: null,
      worst: null,
      streak: 0,
    };
  }
  let total = 0;
  let max = -Infinity;
  let min = Infinity;
  let best = points[0];
  let worst = points[0];
  for (const p of points) {
    total += p.value;
    if (p.value > max) {
      max = p.value;
      best = p;
    }
    if (p.value < min) {
      min = p.value;
      worst = p;
    }
  }
  const avg = Math.round(total / points.length);
  let streak = 0;
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].value >= avg) streak++;
    else break;
  }
  return { total, avg, max, min, best, worst, streak };
}

export default function CalendarScene() {
  const { view, roles, ready } = useActiveDataset();
  const built = useMemo(
    () => (ready && view ? buildCalendarSql(view, roles) : null),
    [ready, view, roles],
  );

  const {
    data = [],
    isLoading,
    error,
    refetch,
  } = useDuckDBQuery(built?.sql ?? "", [view], {
    enabled: Boolean(built),
  });

  const points = useMemo<DayPoint[]>(() => {
    const out: DayPoint[] = [];
    for (const row of data) {
      const date = asStr(row.d);
      if (!date || date === "null") continue;
      const year = Number(date.slice(0, 4));
      if (!Number.isFinite(year)) continue;
      out.push({ date, value: asNum(row.v), year });
    }
    return out;
  }, [data]);

  const years = useMemo(() => {
    const set = new Set<number>();
    for (const p of points) set.add(p.year);
    return Array.from(set).sort((a, b) => a - b);
  }, [points]);

  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const activeYear =
    selectedYear != null && years.includes(selectedYear)
      ? selectedYear
      : (years[years.length - 1] ?? null);

  const yearPoints = useMemo(
    () => (activeYear == null ? [] : points.filter((p) => p.year === activeYear)),
    [points, activeYear],
  );

  const stats = useMemo(() => computeStats(yearPoints), [yearPoints]);

  const option = useMemo(() => {
    if (activeYear == null) return {};
    return {
      backgroundColor: "transparent",
      tooltip: {
        backgroundColor: TOOLTIP_BG,
        borderColor: TOOLTIP_BORDER,
        textStyle: { color: TEXT_COLOR, fontSize: 12 },
        formatter: (p: { data: [string, number] }) => `<b>${p.data[0]}</b><br/>${fmtN(p.data[1])}`,
      },
      visualMap: {
        min: stats.min,
        max: stats.max,
        calculable: true,
        orient: "horizontal" as const,
        left: "center" as const,
        bottom: 0,
        inRange: {
          color: ["#0d1117", "#0e4429", "#006d32", "#26a641", "#39d353"],
        },
        textStyle: { color: TEXT_COLOR, fontSize: 11 },
      },
      calendar: {
        top: 30,
        left: 40,
        right: 20,
        bottom: 50,
        cellSize: ["auto", 16] as [string, number],
        range: activeYear,
        itemStyle: { borderColor: "#ffffff08", borderWidth: 1 },
        dayLabel: {
          color: TEXT_COLOR,
          fontSize: 10,
          firstDay: 1,
          nameMap: ["", "Mon", "", "Wed", "", "Fri", ""],
        },
        monthLabel: { color: TEXT_COLOR, fontSize: 11 },
        yearLabel: { show: false },
        splitLine: { lineStyle: { color: "#ffffff18" } },
      },
      series: [
        {
          type: "heatmap",
          coordinateSystem: "calendar",
          data: yearPoints.map((p) => [p.date, p.value]),
          emphasis: {
            itemStyle: { shadowBlur: 10, shadowColor: "#39d35388" },
          },
        },
      ],
    };
  }, [activeYear, yearPoints, stats.min, stats.max]);

  return (
    <SceneShell
      isLoading={isLoading}
      error={error}
      unsupported={!built}
      unsupportedHint="Add a dataset with a date/timestamp column to draw a calendar heatmap."
      isEmpty={points.length === 0}
      onRetry={() => void refetch()}
    >
      <div className="space-y-4">
        {built?.note && <p className="text-xs text-muted-foreground">{built.note}</p>}

        {years.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            {years.map((y) => (
              <Button
                key={y}
                variant={y === activeYear ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedYear(y)}
              >
                {y}
              </Button>
            ))}
          </div>
        )}

        <Card>
          <CardContent className="pt-4">
            <TheaterChart option={option} style={{ height: 200, width: "100%" }} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            {
              label: "Total",
              value: fmtCompact(stats.total),
              sub: `${yearPoints.length} days`,
            },
            { label: "Daily Average", value: fmtN(stats.avg), sub: "per day" },
            {
              label: "Best Day",
              value: stats.best?.date ?? "—",
              sub: stats.best ? `${fmtN(stats.best.value)}` : "",
            },
            {
              label: "Worst Day",
              value: stats.worst?.date ?? "—",
              sub: stats.worst ? `${fmtN(stats.worst.value)}` : "",
            },
          ].map(({ label, value, sub }) => (
            <Card key={label} size="sm">
              <CardContent className="pt-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 truncate text-base font-semibold text-foreground">{value}</p>
                <p className="text-xs text-muted-foreground">{sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card size="sm">
          <CardContent className="pt-3">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-green-400">
                {stats.streak} consecutive day{stats.streak !== 1 ? "s" : ""}
              </span>{" "}
              at or above average — current streak
            </p>
          </CardContent>
        </Card>
      </div>
    </SceneShell>
  );
}
