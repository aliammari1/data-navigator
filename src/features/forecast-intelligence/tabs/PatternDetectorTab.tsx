"use client";

/**
 * Tab 4 — Pattern Detector.
 *
 * Every pattern here is derived from REAL DuckDB aggregates:
 *  - Day-of-week effect: averages the real per-day volume grouped by weekday
 *    (parsed from each row's date).
 *  - Hour-of-day profile: the real per-hour totals from `fetchHourly`.
 *  - Month-end effect: compares the last days vs the rest of the real series.
 * No synthetic 90-day generator, no Math.random.
 */

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";
import { mean } from "simple-statistics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtCompact, fmtN } from "@/features/telecom/lib/format";
import { useForecastData } from "../data/use-forecast-data";
import { cn, LoadingState, NoDatasetState, NotEnoughDataState } from "./shared";

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const REORDERED_DOW = [1, 2, 3, 4, 5, 6, 0]; // Mon–Sun

export default function PatternDetectorTab() {
  const data = useForecastData();

  const stats = useMemo(() => {
    if (data.daily.length < 2) return null;

    // ── Day-of-week averages from the REAL daily series ──────────────────────
    const sums = new Array(7).fill(0);
    const counts = new Array(7).fill(0);
    for (const row of data.daily) {
      const ts = new Date(row.day).getTime();
      if (!Number.isFinite(ts)) continue;
      const dow = new Date(ts).getUTCDay();
      sums[dow] += row.total;
      counts[dow] += 1;
    }
    const dowAverages = sums.map((s, i) => (counts[i] ? s / counts[i] : 0));
    const presentDows = REORDERED_DOW.filter((i) => counts[i] > 0);
    const dowMean = presentDows.length ? mean(presentDows.map((i) => dowAverages[i]!)) : 0;

    const maxDowIdx = presentDows.reduce(
      (m, i) => (dowAverages[i]! > (dowAverages[m] ?? 0) ? i : m),
      presentDows[0] ?? 1,
    );
    const minDowIdx = presentDows.reduce(
      (m, i) => (dowAverages[i]! < (dowAverages[m] ?? Number.POSITIVE_INFINITY) ? i : m),
      presentDows[0] ?? 1,
    );

    const weekdayPresent = [1, 2, 3, 4, 5].filter((d) => counts[d] > 0);
    const weekendPresent = [0, 6].filter((d) => counts[d] > 0);
    const weekdayMean = weekdayPresent.length
      ? mean(weekdayPresent.map((d) => dowAverages[d]!))
      : 0;
    const weekendMean = weekendPresent.length
      ? mean(weekendPresent.map((d) => dowAverages[d]!))
      : 0;
    const weekendDip = weekdayMean > 0 ? ((weekdayMean - weekendMean) / weekdayMean) * 100 : 0;

    // ── Hour-of-day from the REAL hourly aggregate ───────────────────────────
    const hourTotals = new Array(24).fill(0);
    for (const h of data.hourly) {
      if (h.hour >= 0 && h.hour < 24) hourTotals[h.hour] = h.total;
    }
    const peakHour = data.hourly.length > 0 ? hourTotals.indexOf(Math.max(...hourTotals)) : -1;

    // ── Month-end effect from the REAL tail of the series ────────────────────
    const tail = Math.min(3, Math.floor(data.daily.length / 2));
    const lastAvg = tail ? mean(data.daily.slice(-tail).map((d) => d.total)) : 0;
    const headRows = data.daily.slice(0, data.daily.length - tail);
    const headAvg = headRows.length ? mean(headRows.map((d) => d.total)) : lastAvg;
    const monthEndSurge = headAvg > 0 ? ((lastAvg - headAvg) / headAvg) * 100 : 0;

    return {
      dowAverages,
      dowMean,
      maxDowIdx,
      minDowIdx,
      weekendDip,
      hourTotals,
      peakHour,
      monthEndSurge,
      hasHourly: data.hourly.length > 0,
    };
  }, [data.daily, data.hourly]);

  const dowChartOption = useMemo(() => {
    if (!stats) return null;
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "#1e293b",
        borderColor: "#334155",
        textStyle: { color: "#e2e8f0" },
        formatter: (p: Array<{ name: string; value: number }>) =>
          `${p[0]?.name}: ${fmtN(p[0]?.value ?? 0)} avg txns`,
      },
      grid: { top: 16, bottom: 32, left: 56, right: 16, containLabel: false },
      xAxis: {
        type: "category",
        data: REORDERED_DOW.map((i) => DOW_LABELS[i]),
        axisLabel: { color: "#64748b" },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#64748b", formatter: (v: number) => fmtCompact(v) },
        splitLine: { lineStyle: { color: "#1e293b" } },
      },
      series: [
        {
          type: "bar",
          data: REORDERED_DOW.map((i) => ({
            value: Math.round(stats.dowAverages[i] ?? 0),
            itemStyle: {
              color:
                i === stats.maxDowIdx ? "#10b981" : i === stats.minDowIdx ? "#ef4444" : "#3b82f6",
              borderRadius: [4, 4, 0, 0],
            },
          })),
          barMaxWidth: 48,
        },
      ],
    };
  }, [stats]);

  const hourChartOption = useMemo(() => {
    if (!stats?.hasHourly) return null;
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "#1e293b",
        borderColor: "#334155",
        textStyle: { color: "#e2e8f0" },
        formatter: (p: Array<{ name: string; value: number }>) =>
          `${p[0]?.name}: ${fmtN(p[0]?.value ?? 0)} txns`,
      },
      grid: { top: 16, bottom: 32, left: 56, right: 16, containLabel: false },
      xAxis: {
        type: "category",
        data: Array.from({ length: 24 }, (_, i) => `${i}:00`),
        axisLabel: { color: "#64748b", fontSize: 10, rotate: 45 },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#64748b", formatter: (v: number) => fmtCompact(v) },
        splitLine: { lineStyle: { color: "#1e293b" } },
      },
      series: [
        {
          type: "bar",
          data: stats.hourTotals.map((v, h) => ({
            value: v,
            itemStyle: {
              color: h === stats.peakHour ? "#f59e0b" : "#3b82f6",
              borderRadius: [3, 3, 0, 0],
            },
          })),
          barMaxWidth: 18,
        },
      ],
    };
  }, [stats]);

  const trendChartOption = useMemo(() => {
    if (!data.daily.length) return null;
    const tail = Math.min(3, Math.floor(data.daily.length / 2));
    const cutoff = data.daily.length - tail;
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "#1e293b",
        borderColor: "#334155",
        textStyle: { color: "#e2e8f0" },
      },
      grid: { top: 16, bottom: 32, left: 56, right: 16, containLabel: false },
      xAxis: {
        type: "category",
        data: data.daily.map((d) => d.day.slice(5)),
        axisLabel: { color: "#64748b", fontSize: 10, rotate: 30 },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#64748b", formatter: (v: number) => fmtCompact(v) },
        splitLine: { lineStyle: { color: "#1e293b" } },
      },
      series: [
        {
          name: "Volume",
          type: "line",
          data: data.daily.map((d, i) => ({
            value: d.total,
            itemStyle: { color: i >= cutoff ? "#f59e0b" : "#3b82f6" },
          })),
          lineStyle: { color: "#3b82f6", width: 2 },
          symbol: "circle",
          symbolSize: 5,
        },
      ],
    };
  }, [data.daily]);

  if (data.noDataset) return <NoDatasetState what="pattern detection" />;
  if (data.isLoading) return <LoadingState />;
  if (!stats) return <NotEnoughDataState what="Pattern detection" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <PatternCard
          icon="📅"
          text={`Weekend transactions are ${stats.weekendDip.toFixed(0)}% lower than weekdays`}
          color="border-blue-500/30 bg-blue-500/5"
        />
        <PatternCard
          icon="⏰"
          text={
            stats.peakHour >= 0
              ? `Peak hour is ${stats.peakHour}:00 with ${fmtN(stats.hourTotals[stats.peakHour] ?? 0)} transactions`
              : "Hour-of-day data unavailable for this dataset"
          }
          color="border-violet-500/30 bg-violet-500/5"
        />
        <PatternCard
          icon="📈"
          text={`Recent period: last ${Math.min(3, Math.floor(data.daily.length / 2))} day(s) have ${stats.monthEndSurge > 0 ? "+" : ""}${stats.monthEndSurge.toFixed(0)}% volume vs earlier`}
          color="border-amber-500/30 bg-amber-500/5"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="bg-slate-900/60 ring-slate-700/40">
          <CardHeader>
            <CardTitle className="text-slate-200">Day of Week Effect</CardTitle>
            <div className="flex gap-2 mt-1">
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                Highest: {DOW_LABELS[stats.maxDowIdx]}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
                Lowest: {DOW_LABELS[stats.minDowIdx]}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {dowChartOption && <ReactECharts option={dowChartOption} style={{ height: 220 }} />}
            <p className="text-xs text-slate-400 mt-2">
              {DOW_LABELS[stats.maxDowIdx]}s are{" "}
              <span className="text-emerald-400 font-semibold">
                {stats.dowMean > 0
                  ? (
                      (((stats.dowAverages[stats.maxDowIdx] ?? 0) - stats.dowMean) /
                        stats.dowMean) *
                      100
                    ).toFixed(0)
                  : "0"}
                % above average
              </span>
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 ring-slate-700/40">
          <CardHeader>
            <CardTitle className="text-slate-200">Recent Trend</CardTitle>
            <CardDescription className="text-slate-500">
              Real daily volume with the most recent period highlighted
            </CardDescription>
          </CardHeader>
          <CardContent>
            {trendChartOption && <ReactECharts option={trendChartOption} style={{ height: 240 }} />}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-900/60 ring-slate-700/40">
        <CardHeader>
          <CardTitle className="text-slate-200">Hour of Day Profile</CardTitle>
          <CardDescription className="text-slate-500">
            Transaction volume by hour across the dataset
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hourChartOption ? (
            <ReactECharts option={hourChartOption} style={{ height: 300 }} />
          ) : (
            <p className="py-12 text-center text-sm text-slate-500">
              Hour-of-day data is not available for this dataset.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PatternCard({ icon, text, color }: { icon: string; text: string; color: string }) {
  return (
    <div className={cn("rounded-xl border p-4 text-sm text-slate-300", color)}>
      <span className="mr-2">{icon}</span>
      {text}
    </div>
  );
}
