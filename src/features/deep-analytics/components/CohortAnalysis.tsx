"use client";

import { useMemo } from "react";
import { cn } from "@/shared/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Users, BarChart2, CheckCircle } from "lucide-react";
import { useDuckDBQuery } from "@/core/queries/duckdb";
import { useAnalyticsSource } from "@/features/deep-analytics/lib/use-analytics-source";
import { buildCohortRatesSql } from "@/features/deep-analytics/lib/sql";
import { pickColumn, fmtBucket } from "@/features/deep-analytics/lib/format";
import { welchTTest, significanceFromP } from "@/features/deep-analytics/lib/stats";
import { AnalyticsChart } from "./AnalyticsChart";
import {
  NoDatasetState,
  MissingColumnsState,
  AnalyticsLoading,
  AnalyticsError,
} from "./AnalyticsStates";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RateRow {
  cohort: string;
  bucket: string;
  total: number;
  successes: number;
  rate: number;
}

interface CohortSeries {
  name: string;
  color: string;
  rates: number[]; // aligned to the global bucket axis (NaN where absent)
  observed: number[]; // only present buckets, for stats
  first: number;
  last: number;
  trend: number;
}

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#a78bfa",
  "#f97316",
  "#84cc16",
  "#ef4444",
  "#14b8a6",
  "#eab308",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCellColor(rate: number): string {
  if (!Number.isFinite(rate)) return "bg-slate-800 text-slate-500";
  if (rate >= 90) return "bg-emerald-900/70 text-emerald-300";
  if (rate >= 80) return "bg-emerald-800/50 text-emerald-400";
  if (rate >= 70) return "bg-yellow-900/50 text-yellow-300";
  if (rate >= 60) return "bg-orange-900/50 text-orange-300";
  return "bg-red-900/60 text-red-300";
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.NaN;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CohortAnalysis() {
  const source = useAnalyticsSource();

  const categoryCol = useMemo(
    () =>
      pickColumn(source.categoricalColumns, [
        /channel|canal|cohort|segment|category|operator|product|service/i,
      ]) ?? source.categoricalColumns[0],
    [source.categoricalColumns],
  );
  const dateCol = useMemo(
    () =>
      pickColumn(source.dateColumns, [/date|time|timestamp|ts|day|created/i]) ??
      source.dateColumns[0],
    [source.dateColumns],
  );
  const statusCol = useMemo(
    () => pickColumn(source.categoricalColumns, [/status|state|result|outcome/i]),
    [source.categoricalColumns],
  );

  const canQuery = source.enabled && !!categoryCol && !!dateCol;

  const sql = useMemo(() => {
    if (!canQuery || !source.viewName) return "";
    return buildCohortRatesSql({
      view: source.viewName,
      // biome-ignore lint/style/noNonNullAssertion: guarded by canQuery (!!categoryCol && !!dateCol) above
      categoryCol: categoryCol!,
      // biome-ignore lint/style/noNonNullAssertion: guarded by canQuery (!!categoryCol && !!dateCol) above
      dateCol: dateCol!,
      statusCol,
      bucket: "week",
      topCategories: 12,
    });
  }, [canQuery, source.viewName, categoryCol, dateCol, statusCol]);

  const { data, isLoading, isError, error } = useDuckDBQuery(sql, [sql], {
    enabled: canQuery,
  });

  // ── Shape the result into per-cohort series aligned on a global bucket axis ──
  const { buckets, series } = useMemo(() => {
    const rows = (data ?? []) as Record<string, unknown>[];
    const rateRows: RateRow[] = rows.map((r) => ({
      cohort: String(r.cohort ?? ""),
      bucket: fmtBucket(r.bucket),
      total: num(r.total),
      successes: num(r.successes),
      rate: num(r.rate),
    }));

    const bucketSet = Array.from(new Set(rateRows.map((r) => r.bucket))).sort();
    const cohortNames = Array.from(new Set(rateRows.map((r) => r.cohort)));

    const seriesOut: CohortSeries[] = cohortNames.map((name, ci) => {
      const byBucket = new Map<string, number>();
      for (const r of rateRows) {
        if (r.cohort === name) byBucket.set(r.bucket, r.rate);
      }
      const rates = bucketSet.map((b) => byBucket.get(b) ?? Number.NaN);
      const observed = rates.filter((v) => Number.isFinite(v));
      const first = observed[0] ?? Number.NaN;
      const last = observed[observed.length - 1] ?? Number.NaN;
      return {
        name,
        color: COLORS[ci % COLORS.length] ?? "#3b82f6",
        rates,
        observed,
        first,
        last,
        trend: Number.isFinite(first) && Number.isFinite(last) ? last - first : 0,
      };
    });

    return { buckets: bucketSet, series: seriesOut };
  }, [data]);

  const winner = useMemo(
    () =>
      series.length ? series.reduce((best, s) => (s.trend > best.trend ? s : best)) : undefined,
    [series],
  );
  const struggler = useMemo(
    () =>
      series.length ? series.reduce((worst, s) => (s.trend < worst.trend ? s : worst)) : undefined,
    [series],
  );

  // Real Welch t-test between the best and worst cohort's observed weekly rates.
  const ttest = useMemo(() => {
    if (!winner || !struggler || winner.name === struggler.name) return null;
    return welchTTest(winner.observed, struggler.observed);
  }, [winner, struggler]);
  const sig = significanceFromP(ttest?.p);

  // ── Charts (memoised; identity stable while data unchanged) ──
  const heatmapOption = useMemo(() => {
    const points: [number, number, number][] = [];
    series.forEach((s, ci) => {
      s.rates.forEach((rate, bi) => {
        if (Number.isFinite(rate)) points.push([bi, ci, Math.round(rate)]);
      });
    });
    return {
      backgroundColor: "transparent",
      tooltip: {
        position: "top",
        formatter: (p: { data: [number, number, number] }) =>
          `${series[p.data[1]]?.name} — ${buckets[p.data[0]]}: ${p.data[2]}%`,
      },
      grid: { top: 20, bottom: 70, left: 180, right: 20 },
      xAxis: {
        type: "category",
        data: buckets,
        axisLabel: { color: "#94a3b8", rotate: 30, fontSize: 9 },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      yAxis: {
        type: "category",
        data: series.map((s) => s.name),
        axisLabel: { color: "#94a3b8", fontSize: 11 },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      visualMap: {
        min: 0,
        max: 100,
        calculable: true,
        orient: "horizontal",
        left: "center",
        bottom: 0,
        textStyle: { color: "#94a3b8" },
        inRange: { color: ["#7f1d1d", "#d97706", "#065f46"] },
      },
      series: [
        {
          name: "Success Rate",
          type: "heatmap",
          data: points,
          progressive: 2000,
          label: {
            show: buckets.length <= 12,
            formatter: (p: { data: [number, number, number] }) => `${p.data[2]}%`,
            fontSize: 10,
            color: "#e2e8f0",
          },
          emphasis: { itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.5)" } },
        },
      ],
    };
  }, [series, buckets]);

  const lineOption = useMemo(
    () => ({
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "#1e293b",
        borderColor: "#334155",
        textStyle: { color: "#e2e8f0" },
      },
      legend: {
        data: series.map((s) => s.name),
        textStyle: { color: "#94a3b8", fontSize: 10 },
        type: "scroll",
        bottom: 0,
      },
      grid: { top: 20, bottom: 60, left: 50, right: 20 },
      xAxis: {
        type: "category",
        data: buckets,
        axisLabel: { color: "#94a3b8", rotate: 30, fontSize: 9 },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#94a3b8", formatter: "{value}%" },
        splitLine: { lineStyle: { color: "#1e293b" } },
      },
      series: series.map((s) => ({
        name: s.name,
        type: "line",
        smooth: true,
        connectNulls: true,
        data: s.rates.map((v) => (Number.isFinite(v) ? Number(v.toFixed(1)) : null)),
        lineStyle: { color: s.color, width: 2 },
        itemStyle: { color: s.color },
        areaStyle: { color: s.color, opacity: 0.06 },
      })),
    }),
    [series, buckets],
  );

  // ── Empty / error gating ──
  if (!source.enabled) return <NoDatasetState />;
  if (!categoryCol || !dateCol) {
    return (
      <MissingColumnsState
        detail={
          <>
            Cohort analysis needs a categorical column (e.g. channel) and a date/time column. Active
            dataset “{source.datasetName}” has {source.categoricalColumns.length} categorical and{" "}
            {source.dateColumns.length} date columns.
          </>
        }
      />
    );
  }
  if (isLoading) return <AnalyticsLoading />;
  if (isError) return <AnalyticsError message={String((error as Error)?.message ?? error)} />;
  if (series.length === 0) {
    return (
      <MissingColumnsState
        detail={`No cohort rows returned for "${categoryCol}" bucketed by "${dateCol}".`}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Source header */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="text-slate-100 flex items-center gap-2">
            <Users className="size-4 text-blue-400" />
            Channel Cohorts
          </CardTitle>
          <CardDescription>
            Weekly success rate per “{categoryCol}” from <b>{source.datasetName}</b>
            {statusCol ? ` (success = ${statusCol})` : " (row volume share)"} — {series.length}{" "}
            cohorts × {buckets.length} weeks
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Winner / Struggler / Significance */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-emerald-800/50 bg-emerald-950/30">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <TrendingUp className="size-8 text-emerald-400 mt-0.5" />
              <div>
                <p className="text-xs text-slate-400 mb-1">Cohort Winner</p>
                <p className="font-semibold text-emerald-300">{winner?.name}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {winner && winner.trend >= 0 ? "+" : ""}
                  {winner?.trend.toFixed(1)}pp over {buckets.length} weeks
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-800/50 bg-red-950/30">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <TrendingDown className="size-8 text-red-400 mt-0.5" />
              <div>
                <p className="text-xs text-slate-400 mb-1">Struggling Cohort</p>
                <p className="font-semibold text-red-300">{struggler?.name}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {struggler && struggler.trend >= 0 ? "+" : ""}
                  {struggler?.trend.toFixed(1)}pp over {buckets.length} weeks
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-700/50 bg-slate-900/50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <CheckCircle className="size-8 text-yellow-400 mt-0.5" />
              <div>
                <p className="text-xs text-slate-400 mb-1">Statistical Significance</p>
                <p className={cn("font-semibold text-sm", sig.color)}>{sig.label}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {ttest
                    ? `Welch t=${ttest.t.toFixed(2)}, p=${ttest.p.toFixed(3)} (winner vs struggler weekly rates)`
                    : "Not enough overlapping weeks to test"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Heatmap */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="text-slate-100 flex items-center gap-2">
            <BarChart2 className="size-4 text-purple-400" />
            Cohort Performance Heatmap
          </CardTitle>
          <CardDescription>Weekly success rate per cohort</CardDescription>
        </CardHeader>
        <CardContent>
          <AnalyticsChart option={heatmapOption} height={Math.max(220, series.length * 28 + 90)} />
        </CardContent>
      </Card>

      {/* Trend lines */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="text-slate-100">Cohort Trend Lines</CardTitle>
          <CardDescription>Week-over-week success-rate trajectory</CardDescription>
        </CardHeader>
        <CardContent>
          <AnalyticsChart option={lineOption} height={300} />
        </CardContent>
      </Card>

      {/* Weekly rate table */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="text-slate-100">Weekly Rate Table</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-2 px-3 text-slate-400 font-medium sticky left-0 bg-slate-900">
                    Cohort
                  </th>
                  {buckets.map((b) => (
                    <th
                      key={b}
                      className="text-center py-2 px-2 text-slate-400 font-medium whitespace-nowrap"
                    >
                      {b.slice(5)}
                    </th>
                  ))}
                  <th className="text-center py-2 px-3 text-slate-400 font-medium">Trend</th>
                </tr>
              </thead>
              <tbody>
                {series.map((s) => (
                  <tr key={s.name} className="border-b border-slate-800 hover:bg-slate-800/30">
                    <td className="py-2 px-3 sticky left-0 bg-slate-900">
                      <div className="flex items-center gap-2">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: s.color }}
                        />
                        <span className="text-slate-200 font-medium text-xs whitespace-nowrap">
                          {s.name}
                        </span>
                      </div>
                    </td>
                    {s.rates.map((rate, bi) => (
                      <td key={bi} className="py-1.5 px-1">
                        <span
                          className={cn(
                            "block text-center rounded px-1 py-0.5 text-xs font-mono",
                            getCellColor(rate),
                          )}
                        >
                          {Number.isFinite(rate) ? `${rate.toFixed(0)}%` : "—"}
                        </span>
                      </td>
                    ))}
                    <td className="py-2 px-3 text-center">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-xs font-medium",
                          s.trend >= 0 ? "text-emerald-400" : "text-red-400",
                        )}
                      >
                        {s.trend >= 0 ? (
                          <TrendingUp className="size-3" />
                        ) : (
                          <TrendingDown className="size-3" />
                        )}
                        {s.trend >= 0 ? "+" : ""}
                        {s.trend.toFixed(1)}pp
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
