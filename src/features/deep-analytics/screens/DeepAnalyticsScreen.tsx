"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Layers,
  DollarSign,
  Network,
  CalendarRange,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";
import { cn } from "@/shared/utils";
import { useDuckDBQuery } from "@/core/queries/duckdb";
import { CohortAnalysis } from "@/features/deep-analytics/components/CohortAnalysis";
import { RevenueAttributionModel } from "@/features/deep-analytics/components/RevenueAttributionModel";
import { AnalyticsChart } from "@/features/deep-analytics/components/AnalyticsChart";
import {
  NoDatasetState,
  MissingColumnsState,
  AnalyticsLoading,
  AnalyticsError,
} from "@/features/deep-analytics/components/AnalyticsStates";
import { useAnalyticsSource } from "@/features/deep-analytics/lib/use-analytics-source";
import {
  buildClusterSampleSql,
  buildPeriodMetricsSql,
} from "@/features/deep-analytics/lib/sql";
import {
  pickColumn,
  fmtBucket,
  fmtRevenue,
  fmtInt,
} from "@/features/deep-analytics/lib/format";
import { welchTTest, significanceFromP } from "@/features/deep-analytics/lib/stats";
import { getMLClient } from "@/features/deep-analytics/lib/ml-client";
import { loadRun, saveRun } from "@/features/deep-analytics/lib/runs-store";
import type { KMeansResult } from "@/features/deep-analytics/workers/analytics.worker";

const CLUSTER_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16",
];

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.NaN;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLUSTER ANALYSIS TAB — real DuckDB sample + seeded worker k-means
// ═══════════════════════════════════════════════════════════════════════════════

interface SamplePoint {
  x: number;
  y: number;
  label: string | null;
  status: string | null;
}

interface ClusterSummary {
  centroid: number[];
  indices: number[];
  size: number;
  label: string;
  successRate: number | null;
  avgX: number;
  avgY: number;
  dominant: string;
}

function ClusterAnalysis() {
  const source = useAnalyticsSource();
  const [k, setK] = useState(4);
  const [result, setResult] = useState<KMeansResult | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  // Pick two numeric feature columns + optional label/status from the dataset.
  const xCol = useMemo(
    () =>
      pickColumn(source.numericColumns, [/amount|montant|value|price|total|mnt/i]) ??
      source.numericColumns[0],
    [source.numericColumns],
  );
  const yCol = useMemo(() => {
    const preferred = pickColumn(source.numericColumns, [/hour|heure|duration|count|qty|age/i]);
    const distinct = source.numericColumns.find((c) => c !== xCol);
    return preferred && preferred !== xCol ? preferred : distinct;
  }, [source.numericColumns, xCol]);
  const labelCol = useMemo(
    () => pickColumn(source.categoricalColumns, [/channel|canal|operator|category|segment|product/i]),
    [source.categoricalColumns],
  );
  const statusCol = useMemo(
    () => pickColumn(source.categoricalColumns, [/status|state|result|outcome/i]),
    [source.categoricalColumns],
  );

  const canQuery = source.enabled && !!xCol && !!yCol;

  // Restore the last chosen k for this dataset (reproducibility on reload).
  useEffect(() => {
    let alive = true;
    const datasetId = source.datasetId;
    if (!datasetId) return;
    void (async () => {
      const run = await loadRun<{ k: number }>("cluster", datasetId);
      if (alive && run?.payload?.k) setK(run.payload.k);
    })();
    return () => {
      alive = false;
    };
  }, [source.datasetId]);

  const sql = useMemo(() => {
    if (!canQuery || !source.viewName) return "";
    return buildClusterSampleSql({
      view: source.viewName,
      // biome-ignore lint/style/noNonNullAssertion: guarded by canQuery (source.enabled && !!xCol && !!yCol) above
      xCol: xCol!,
      // biome-ignore lint/style/noNonNullAssertion: guarded by canQuery (source.enabled && !!xCol && !!yCol) above
      yCol: yCol!,
      labelCol,
      statusCol,
      sampleRows: 5000,
    });
  }, [canQuery, source.viewName, xCol, yCol, labelCol, statusCol]);

  const { data, isLoading, isError, error } = useDuckDBQuery(sql, [sql], {
    enabled: canQuery,
  });

  const points = useMemo<SamplePoint[]>(() => {
    const rows = (data ?? []) as Record<string, unknown>[];
    return rows
      .map((r) => ({
        x: num(r.x),
        y: num(r.y),
        label: r.label == null ? null : String(r.label),
        status: r.status == null ? null : String(r.status),
      }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  }, [data]);

  // Re-clustering invalidates on new data.
  // biome-ignore lint/correctness/useExhaustiveDependencies: sql is the reset trigger, not read inside.
  useEffect(() => {
    setResult(null);
    setRunError(null);
  }, [sql]);

  const runClustering = useCallback(async () => {
    if (points.length < k) {
      setRunError(`Need at least ${k} rows to form ${k} clusters (have ${points.length}).`);
      return;
    }
    setRunning(true);
    setRunError(null);
    try {
      const features = points.map((p) => [p.x, p.y]);
      const ml = getMLClient();
      const res = await ml.kMeans(features, { k, maxIterations: 50, seed: 42 });
      setResult(res);
      // Persist the chosen k + run metadata for reproducible reloads.
      if (source.datasetId) {
        void saveRun("cluster", source.datasetId, {
          k,
          seed: 42,
          totalWithinss: res.totalWithinss,
          iterations: res.iterations,
          sampledRows: points.length,
        });
      }
    } catch (e) {
      setRunError(String((e as Error)?.message ?? e));
      setResult(null);
    } finally {
      setRunning(false);
    }
  }, [points, k, source.datasetId]);

  const clusters = useMemo<ClusterSummary[]>(() => {
    if (!result) return [];
    const groups: number[][] = Array.from({ length: result.centroids.length }, () => []);
    result.labels.forEach((label, i) => {
      groups[label]?.push(i);
    });
    return groups.map((indices, ci) => {
      // biome-ignore lint/style/noNonNullAssertion: indices come from result.labels iteration over points, so points[i] is defined
      const pts = indices.map((i) => points[i]!).filter(Boolean);
      const withStatus = pts.filter((p) => p.status != null);
      const successCount = withStatus.filter((p) => /succe/i.test(p.status ?? "")).length;
      const successRate = withStatus.length > 0 ? (successCount / withStatus.length) * 100 : null;
      const avgX = pts.length ? pts.reduce((s, p) => s + p.x, 0) / pts.length : 0;
      const avgY = pts.length ? pts.reduce((s, p) => s + p.y, 0) / pts.length : 0;
      const counts: Record<string, number> = {};
      pts.forEach((p) => {
        if (p.label) counts[p.label] = (counts[p.label] ?? 0) + 1;
      });
      const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
      return {
        centroid: result.centroids[ci] ?? [avgX, avgY],
        indices,
        size: indices.length,
        label: `Cluster ${ci + 1}`,
        successRate,
        avgX,
        avgY,
        dominant,
      };
    });
  }, [result, points]);

  const scatterOption = useMemo(() => {
    if (clusters.length === 0) return {};
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        backgroundColor: "#1e293b",
        borderColor: "#334155",
        textStyle: { color: "#e2e8f0" },
        formatter: (p: { data: [number, number]; seriesName: string }) =>
          `<b>${p.seriesName}</b><br/>${xCol}: ${Number(p.data[0]).toFixed(1)}<br/>${yCol}: ${Number(p.data[1]).toFixed(1)}`,
      },
      legend: {
        data: clusters.map((c) => c.label),
        textStyle: { color: "#94a3b8", fontSize: 10 },
        bottom: 0,
        type: "scroll",
      },
      grid: { top: 20, bottom: 50, left: 60, right: 20 },
      xAxis: {
        name: xCol,
        nameTextStyle: { color: "#64748b" },
        axisLabel: { color: "#94a3b8" },
        splitLine: { lineStyle: { color: "#1e293b" } },
      },
      yAxis: {
        name: yCol,
        nameTextStyle: { color: "#64748b" },
        axisLabel: { color: "#94a3b8" },
        splitLine: { lineStyle: { color: "#1e293b" } },
      },
      series: clusters.map((c, ci) => ({
        name: c.label,
        type: "scatter",
        large: true,
        largeThreshold: 2000,
        progressive: 4000,
        symbolSize: 5,
        // biome-ignore lint/style/noNonNullAssertion: c.indices are point indices from the clustering result, so points[i] is defined
        data: c.indices.map((i) => [points[i]!.x, points[i]!.y]),
        itemStyle: { color: CLUSTER_COLORS[ci % CLUSTER_COLORS.length], opacity: 0.7 },
      })),
    };
  }, [clusters, points, xCol, yCol]);

  const hasSuccess = clusters.some((c) => c.successRate != null);
  const worst = hasSuccess
    ? clusters.filter((c) => c.successRate != null).reduce((w, c) => ((c.successRate ?? 100) < (w.successRate ?? 100) ? c : w))
    : undefined;
  const best = hasSuccess
    ? clusters.filter((c) => c.successRate != null).reduce((b, c) => ((c.successRate ?? 0) > (b.successRate ?? 0) ? c : b))
    : undefined;

  if (!source.enabled) return <NoDatasetState />;
  if (!xCol || !yCol) {
    return (
      <MissingColumnsState
        detail={
          <>
            Clustering needs at least two numeric columns. Dataset “{source.datasetName}”
            has {source.numericColumns.length} numeric column
            {source.numericColumns.length === 1 ? "" : "s"}.
          </>
        }
      />
    );
  }
  if (isLoading) return <AnalyticsLoading label="Sampling rows from DuckDB…" />;
  if (isError) return <AnalyticsError message={String((error as Error)?.message ?? error)} />;

  return (
    <div className="space-y-6">
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <Network className="size-4 text-purple-400" />
                Transaction Cluster Analysis
              </CardTitle>
              <CardDescription>
                Seeded k-means (off-thread) on {xCol} × {yCol} — {fmtInt(points.length)} sampled rows
              </CardDescription>
            </div>
            <Button
              onClick={runClustering}
              disabled={running || points.length === 0}
              className="bg-purple-700 hover:bg-purple-600 text-white"
            >
              {running ? (
                <><RefreshCw className="size-4 animate-spin" />Clustering…</>
              ) : (
                <><Network className="size-4" />Run k-Means</>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400">Number of clusters (k):</span>
            <div className="w-48">
              <Slider min={2} max={8} value={[k]} onValueChange={(v) => setK(v[0] ?? 4)} />
            </div>
            <span className="text-sm font-bold text-slate-200 w-4">{k}</span>
          </div>
          {runError && <p className="mt-3 text-xs text-red-400">{runError}</p>}
        </CardContent>
      </Card>

      {result && clusters.length > 0 && (
        <>
          <Card className="border-slate-800 bg-slate-900">
            <CardHeader>
              <CardTitle className="text-slate-100">Cluster Scatter Plot</CardTitle>
              <CardDescription>
                {fmtInt(points.length)} points · converged in {result.iterations} iterations · total withinss{" "}
                {result.totalWithinss.toExponential(2)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AnalyticsChart option={scatterOption} height={380} />
            </CardContent>
          </Card>

          {worst && best && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Card className="border-red-800/40 bg-red-950/20">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="size-5 text-red-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-slate-400">Highest-Risk Cluster</p>
                      <p className="font-semibold text-red-300 text-sm">{worst.label}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {worst.successRate?.toFixed(1)}% success — consider priority routing
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-emerald-800/40 bg-emerald-950/20">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="size-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-slate-400">Priority Processing Candidate</p>
                      <p className="font-semibold text-emerald-300 text-sm">{best.label}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {best.successRate?.toFixed(1)}% success — allocate capacity
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {clusters.map((c, ci) => (
              <Card key={ci} className="border-slate-700 bg-slate-900">
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="size-3 rounded-full flex-shrink-0" style={{ backgroundColor: CLUSTER_COLORS[ci % CLUSTER_COLORS.length] }} />
                    <span className="font-semibold text-slate-200 text-xs leading-tight">{c.label}</span>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>Rows</span>
                      <span className="text-slate-200 font-mono">{fmtInt(c.size)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Avg {xCol}</span>
                      <span className="text-slate-200 font-mono">{c.avgX.toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Avg {yCol}</span>
                      <span className="text-slate-200 font-mono">{c.avgY.toFixed(1)}</span>
                    </div>
                    {labelCol && (
                      <div className="flex justify-between text-slate-400">
                        <span>Top {labelCol}</span>
                        <span className="text-slate-200 truncate max-w-[7rem]">{c.dominant}</span>
                      </div>
                    )}
                    {c.successRate != null && (
                      <div className="flex justify-between text-slate-400">
                        <span>Success Rate</span>
                        <span className={cn("font-mono font-medium", c.successRate >= 88 ? "text-emerald-400" : c.successRate >= 75 ? "text-yellow-400" : "text-red-400")}>
                          {c.successRate.toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MULTI-PERIOD COMPARISON TAB — real DuckDB period metrics + real Welch t-test
// ═══════════════════════════════════════════════════════════════════════════════

interface PeriodRow {
  id: string;
  label: string;
  volume: number;
  successRate: number;
  revenue: number;
  failures: number;
  avgAmount: number;
}

const METRICS = ["Volume", "Success Rate", "Revenue", "Failures", "Avg Amount"] as const;
type MetricKey = (typeof METRICS)[number];
const PERIOD_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444"];

function getMetricValue(p: PeriodRow, m: MetricKey): number {
  switch (m) {
    case "Volume": return p.volume;
    case "Success Rate": return p.successRate;
    case "Revenue": return p.revenue;
    case "Failures": return p.failures;
    case "Avg Amount": return p.avgAmount;
  }
}

function formatMetric(m: MetricKey, v: number): string {
  if (m === "Revenue") return fmtRevenue(v);
  if (m === "Success Rate") return `${v.toFixed(1)}%`;
  if (m === "Volume" || m === "Failures") return fmtInt(v);
  return `${v.toFixed(0)} TND`;
}

function MultiPeriodComparison() {
  const source = useAnalyticsSource();

  const dateCol = useMemo(
    () => pickColumn(source.dateColumns, [/date|time|timestamp|ts|day|created/i]) ?? source.dateColumns[0],
    [source.dateColumns],
  );
  const amountCol = useMemo(
    () => pickColumn(source.numericColumns, [/amount|montant|revenue|value|price|total|mnt/i]),
    [source.numericColumns],
  );
  const statusCol = useMemo(
    () => pickColumn(source.categoricalColumns, [/status|state|result|outcome/i]),
    [source.categoricalColumns],
  );

  const canQuery = source.enabled && !!dateCol;

  const sql = useMemo(() => {
    if (!canQuery || !source.viewName) return "";
    return buildPeriodMetricsSql({
      view: source.viewName,
      // biome-ignore lint/style/noNonNullAssertion: guarded by canQuery (source.enabled && !!dateCol) above
      dateCol: dateCol!,
      amountCol,
      statusCol,
      bucket: "week",
      limit: 26,
    });
  }, [canQuery, source.viewName, dateCol, amountCol, statusCol]);

  const { data, isLoading, isError, error } = useDuckDBQuery(sql, [sql], {
    enabled: canQuery,
  });

  // DuckDB returns newest-first; reverse for chronological order.
  const allPeriods = useMemo<PeriodRow[]>(() => {
    const rows = ((data ?? []) as Record<string, unknown>[]).slice().reverse();
    return rows.map((r, i) => ({
      id: `p${i}`,
      label: fmtBucket(r.period),
      volume: Number(num(r.volume)) || 0,
      successRate: Number(num(r.success_rate)) || 0,
      revenue: Number(num(r.revenue)) || 0,
      failures: Number(num(r.failures)) || 0,
      avgAmount: Number(num(r.avg_amount)) || 0,
    }));
  }, [data]);

  const [activeIds, setActiveIds] = useState<string[]>([]);

  // Default-select the most recent 2 periods when data first arrives.
  useEffect(() => {
    if (allPeriods.length === 0) {
      setActiveIds([]);
      return;
    }
    setActiveIds(allPeriods.slice(-2).map((p) => p.id));
  }, [allPeriods]);

  const periods = useMemo(
    () => allPeriods.filter((p) => activeIds.includes(p.id)),
    [allPeriods, activeIds],
  );

  const togglePeriod = useCallback(
    (id: string) =>
      setActiveIds((prev) =>
        prev.includes(id)
          ? prev.length > 1 ? prev.filter((p) => p !== id) : prev
          : prev.length < 4 ? [...prev, id] : prev,
      ),
    [],
  );

  // Real two-sample test on the daily success-rate buckets of the two
  // most-recently-selected periods is not meaningful with a single point each,
  // so compare the first vs second half of the selected periods' success rates.
  const ttest = useMemo(() => {
    if (periods.length < 2) return null;
    const rates = periods.map((p) => p.successRate);
    const mid = Math.ceil(rates.length / 2);
    return welchTTest(rates.slice(0, mid), rates.slice(mid));
  }, [periods]);
  const sig = significanceFromP(ttest?.p);

  const trendOption = useMemo(
    () => ({
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", backgroundColor: "#1e293b", borderColor: "#334155", textStyle: { color: "#e2e8f0" } },
      legend: { data: periods.map((p) => p.label), textStyle: { color: "#94a3b8" }, bottom: 0 },
      grid: { top: 20, bottom: 50, left: 60, right: 20 },
      xAxis: { type: "category", data: METRICS, axisLabel: { color: "#94a3b8", rotate: 15, fontSize: 10 }, axisLine: { lineStyle: { color: "#334155" } } },
      yAxis: { type: "value", axisLabel: { color: "#94a3b8" }, splitLine: { lineStyle: { color: "#1e293b" } } },
      series: periods.map((p, pi) => ({
        name: p.label,
        type: "line",
        smooth: true,
        data: METRICS.map((m) => {
          const v = getMetricValue(p, m);
          if (m === "Revenue") return Number((v / 1_000_000).toFixed(2));
          if (m === "Volume" || m === "Failures") return Number((v / 100).toFixed(1));
          return Number(v.toFixed(1));
        }),
        lineStyle: { color: PERIOD_COLORS[pi % PERIOD_COLORS.length], width: 2 },
        itemStyle: { color: PERIOD_COLORS[pi % PERIOD_COLORS.length] },
      })),
    }),
    [periods],
  );

  if (!source.enabled) return <NoDatasetState />;
  if (!dateCol) {
    return (
      <MissingColumnsState
        detail={
          <>
            Period comparison needs a date/time column. Dataset “{source.datasetName}”
            has {source.dateColumns.length} date columns.
          </>
        }
      />
    );
  }
  if (isLoading) return <AnalyticsLoading />;
  if (isError) return <AnalyticsError message={String((error as Error)?.message ?? error)} />;
  if (allPeriods.length === 0) {
    return <MissingColumnsState detail={`No periods returned bucketing "${dateCol}" by week.`} />;
  }

  return (
    <div className="space-y-6">
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="text-slate-100 flex items-center gap-2">
            <CalendarRange className="size-4 text-yellow-400" />
            Period Selector
          </CardTitle>
          <CardDescription>
            Weekly buckets of “{dateCol}” from {source.datasetName} — select up to 4
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {allPeriods.map((p, _pi) => {
              const active = activeIds.includes(p.id);
              const colorIdx = activeIds.indexOf(p.id);
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => togglePeriod(p.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                    active ? "border-transparent text-white" : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500",
                  )}
                  style={active ? { backgroundColor: PERIOD_COLORS[colorIdx % PERIOD_COLORS.length] } : {}}
                >
                  {p.label}
                  {active && <CheckCircle className="size-3.5" />}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="text-slate-100">Comparison Matrix</CardTitle>
          <CardDescription>Best values green, worst red</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-2 px-3 text-slate-400 font-medium">Metric</th>
                  {periods.map((p, pi) => (
                    <th key={p.id} className="text-center py-2 px-3 text-slate-400 font-medium">
                      <span className="inline-block rounded px-2 py-0.5 text-xs text-white" style={{ backgroundColor: PERIOD_COLORS[pi % PERIOD_COLORS.length] }}>
                        {p.label}
                      </span>
                    </th>
                  ))}
                  <th className="text-center py-2 px-3 text-slate-400 font-medium">vs Prev</th>
                </tr>
              </thead>
              <tbody>
                {METRICS.map((m) => {
                  const values = periods.map((p) => getMetricValue(p, m));
                  const isLowerBetter = m === "Failures";
                  const bestVal = isLowerBetter ? Math.min(...values) : Math.max(...values);
                  const worstVal = isLowerBetter ? Math.max(...values) : Math.min(...values);
                  const last = values[values.length - 1] ?? 0;
                  const prev = values[values.length - 2] ?? last;
                  const delta = last - prev;
                  const deltaPct = prev !== 0 ? (delta / prev) * 100 : 0;
                  const deltaGood = isLowerBetter ? delta < 0 : delta > 0;
                  return (
                    <tr key={m} className="border-b border-slate-800 hover:bg-slate-800/30">
                      <td className="py-2 px-3 text-slate-300 font-medium">{m}</td>
                      {periods.map((p) => {
                        const v = getMetricValue(p, m);
                        const isBest = v === bestVal && values.length > 1;
                        const isWorst = v === worstVal && values.length > 1 && bestVal !== worstVal;
                        return (
                          <td
                            key={p.id}
                            className={cn(
                              "py-2 px-3 text-center font-mono text-xs font-medium rounded",
                              isBest ? "bg-emerald-900/40 text-emerald-300" : isWorst ? "bg-red-900/40 text-red-300" : "text-slate-300",
                            )}
                          >
                            {formatMetric(m, v)}
                          </td>
                        );
                      })}
                      <td className="py-2 px-3 text-center">
                        <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", deltaGood ? "text-emerald-400" : "text-red-400")}>
                          {deltaGood ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                          {deltaPct >= 0 ? "+" : ""}{deltaPct.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="text-slate-100">Normalised Trend Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <AnalyticsChart option={trendOption} height={300} />
        </CardContent>
      </Card>

      <Card className="border-slate-700 bg-slate-900">
        <CardContent className="pt-4">
          <div className="flex items-center gap-3">
            {ttest?.significant ? (
              <CheckCircle className="size-5 text-emerald-400 flex-shrink-0" />
            ) : (
              <Minus className="size-5 text-slate-400 flex-shrink-0" />
            )}
            <div>
              <p className={cn("text-sm font-semibold", sig.color)}>{sig.label}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {periods.length >= 2 && ttest
                  ? `Welch t=${ttest.t.toFixed(2)}, p=${ttest.p.toFixed(3)} on success rates across selected periods`
                  : "Select at least 2 periods to run a two-sample test"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ═══════════════════════════════════════════════════════════════════════════════

export function DeepAnalyticsScreen() {
  return (
    <div className="flex flex-col gap-6 p-6" data-tour="deep-analytics">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Deep Analytics</h1>
        <p className="text-slate-400 text-sm mt-1">
          Advanced statistical analysis — cohorts, attribution, clustering, and multi-period comparison
        </p>
      </div>

      <Tabs defaultValue="cohort">
        <TabsList className="bg-slate-800/60 border border-slate-700">
          <TabsTrigger value="cohort" className="data-active:bg-slate-700">
            <Layers className="size-3.5" />
            Cohort Analysis
          </TabsTrigger>
          <TabsTrigger value="attribution" className="data-active:bg-slate-700">
            <DollarSign className="size-3.5" />
            Revenue Attribution
          </TabsTrigger>
          <TabsTrigger value="clusters" className="data-active:bg-slate-700">
            <Network className="size-3.5" />
            Cluster Analysis
          </TabsTrigger>
          <TabsTrigger value="periods" className="data-active:bg-slate-700">
            <CalendarRange className="size-3.5" />
            Period Comparison
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cohort" className="mt-4">
          <CohortAnalysis />
        </TabsContent>

        <TabsContent value="attribution" className="mt-4">
          <RevenueAttributionModel />
        </TabsContent>

        <TabsContent value="clusters" className="mt-4">
          <ClusterAnalysis />
        </TabsContent>

        <TabsContent value="periods" className="mt-4">
          <MultiPeriodComparison />
        </TabsContent>
      </Tabs>
    </div>
  );
}
