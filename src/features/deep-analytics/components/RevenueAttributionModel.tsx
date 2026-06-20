"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign, TrendingUp, BarChart2, RefreshCw } from "lucide-react";
import { useDuckDBQuery } from "@/core/queries/duckdb";
import { useAnalyticsSource } from "@/features/deep-analytics/lib/use-analytics-source";
import { buildAttributionFeaturesSql } from "@/features/deep-analytics/lib/sql";
import { pickColumn, fmtRevenue, fmtInt, fmtPct } from "@/features/deep-analytics/lib/format";
import { getMLClient } from "@/features/deep-analytics/lib/ml-client";
import { saveRun } from "@/features/deep-analytics/lib/runs-store";
import { AnalyticsChart } from "./AnalyticsChart";
import {
  NoDatasetState,
  MissingColumnsState,
  AnalyticsLoading,
  AnalyticsError,
} from "./AnalyticsStates";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChannelFeatureRow {
  channel: string;
  volume: number;
  successRate: number;
  avgAmount: number;
  revenue: number;
}

const FEATURE_LABELS = ["Volume", "Success Rate", "Avg Amount"] as const;
const FEATURE_DESCRIPTIONS: Record<string, string> = {
  Volume: "Transaction count per channel",
  "Success Rate": "Share of successful transactions",
  "Avg Amount": "Average value per transaction",
};
const BAR_COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444"];

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RevenueAttributionModel() {
  const source = useAnalyticsSource();

  const categoryCol = useMemo(
    () =>
      pickColumn(source.categoricalColumns, [
        /channel|canal|operator|product|service|category|segment/i,
      ]) ?? source.categoricalColumns[0],
    [source.categoricalColumns],
  );
  const amountCol = useMemo(
    () =>
      pickColumn(source.numericColumns, [/amount|montant|revenue|value|price|total|mnt/i]) ??
      source.numericColumns[0],
    [source.numericColumns],
  );
  const statusCol = useMemo(
    () => pickColumn(source.categoricalColumns, [/status|state|result|outcome/i]),
    [source.categoricalColumns],
  );

  const canQuery = source.enabled && !!categoryCol && !!amountCol;

  const sql = useMemo(() => {
    if (!canQuery || !source.viewName) return "";
    return buildAttributionFeaturesSql({
      view: source.viewName,
      // biome-ignore lint/style/noNonNullAssertion: guarded by canQuery (!!categoryCol && !!amountCol) above
      categoryCol: categoryCol!,
      // biome-ignore lint/style/noNonNullAssertion: guarded by canQuery (!!categoryCol && !!amountCol) above
      amountCol: amountCol!,
      statusCol,
      topCategories: 40,
    });
  }, [canQuery, source.viewName, categoryCol, amountCol, statusCol]);

  const { data, isLoading, isError, error } = useDuckDBQuery(sql, [sql], {
    enabled: canQuery,
  });

  const channels = useMemo<ChannelFeatureRow[]>(() => {
    const rows = (data ?? []) as Record<string, unknown>[];
    return rows.map((r) => ({
      channel: String(r.channel ?? ""),
      volume: num(r.volume),
      successRate: num(r.success_rate),
      avgAmount: num(r.avg_amount),
      revenue: num(r.revenue),
    }));
  }, [data]);

  const totalRevenue = useMemo(() => channels.reduce((s, c) => s + c.revenue, 0), [channels]);

  // ── Real regression-based attribution via the worker ──
  const [attr, setAttr] = useState<{ shares: number[]; rSquared: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [attrError, setAttrError] = useState<string | null>(null);

  const runAttribution = useCallback(async () => {
    if (channels.length < 3) {
      setAttrError("Need at least 3 channels to fit an attribution model.");
      setAttr(null);
      return;
    }
    setRunning(true);
    setAttrError(null);
    try {
      const X = channels.map((c) => [c.volume, c.successRate, c.avgAmount]);
      const y = channels.map((c) => c.revenue);
      const ml = getMLClient();
      const result = await ml.attribution(X, y);
      setAttr({ shares: result.shares, rSquared: result.rSquared });
      if (source.datasetId) {
        void saveRun("attribution", source.datasetId, {
          shares: result.shares,
          rSquared: result.rSquared,
          channels: channels.length,
        });
      }
    } catch (e) {
      setAttrError(String((e as Error)?.message ?? e));
      setAttr(null);
    } finally {
      setRunning(false);
    }
  }, [channels, source.datasetId]);

  // Reset attribution when the underlying query changes (new dataset/columns).
  // biome-ignore lint/correctness/useExhaustiveDependencies: sql is the reset trigger, not read inside.
  useEffect(() => {
    setAttr(null);
    setAttrError(null);
  }, [sql]);

  const attributionFactors = useMemo(() => {
    if (!attr) return [];
    return FEATURE_LABELS.map((label, i) => ({
      factor: label,
      attribution: attr.shares[i] ?? 0,
      description: FEATURE_DESCRIPTIONS[label] ?? "",
    })).sort((a, b) => b.attribution - a.attribution);
  }, [attr]);

  // ── Charts ──
  const attributionOption = useMemo(() => {
    const ordered = [...attributionFactors].reverse();
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: "#1e293b",
        borderColor: "#334155",
        textStyle: { color: "#e2e8f0" },
        formatter: (p: Array<{ name: string; value: number }>) =>
          `${p[0]?.name}: ${(p[0]?.value ?? 0).toFixed(1)}%`,
      },
      grid: { top: 10, bottom: 10, left: 130, right: 60, containLabel: false },
      xAxis: {
        type: "value",
        max: 100,
        axisLabel: { color: "#94a3b8", formatter: "{value}%" },
        splitLine: { lineStyle: { color: "#1e293b" } },
      },
      yAxis: {
        type: "category",
        data: ordered.map((f) => f.factor),
        axisLabel: { color: "#e2e8f0", fontSize: 12 },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          type: "bar",
          data: ordered.map((f, i) => ({
            value: Number(f.attribution.toFixed(1)),
            itemStyle: { color: BAR_COLORS[i % BAR_COLORS.length], borderRadius: [0, 4, 4, 0] },
          })),
          label: { show: true, position: "right", color: "#94a3b8", formatter: "{c}%" },
          barWidth: 22,
        },
      ],
    };
  }, [attributionFactors]);

  const revenueByChannelOption = useMemo(() => {
    const top = [...channels].sort((a, b) => b.revenue - a.revenue).slice(0, 12);
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "#1e293b",
        borderColor: "#334155",
        textStyle: { color: "#e2e8f0" },
        formatter: (p: Array<{ name: string; value: number }>) =>
          `${p[0]?.name}: ${fmtRevenue(p[0]?.value ?? 0)}`,
      },
      grid: { top: 10, bottom: 70, left: 20, right: 20, containLabel: true },
      xAxis: {
        type: "category",
        data: top.map((c) => c.channel),
        axisLabel: { color: "#94a3b8", rotate: 25, fontSize: 10 },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#94a3b8", formatter: (v: number) => fmtRevenue(v) },
        splitLine: { lineStyle: { color: "#1e293b" } },
      },
      series: [
        {
          type: "bar",
          data: top.map((c, i) => ({
            value: c.revenue,
            itemStyle: { color: BAR_COLORS[i % BAR_COLORS.length], borderRadius: [4, 4, 0, 0] },
          })),
          barWidth: "55%",
        },
      ],
    };
  }, [channels]);

  // ── Empty / error gating ──
  if (!source.enabled) return <NoDatasetState />;
  if (!categoryCol || !amountCol) {
    return (
      <MissingColumnsState
        detail={
          <>
            Revenue attribution needs a categorical channel column and a numeric amount/revenue
            column. Dataset “{source.datasetName}” has {source.categoricalColumns.length}{" "}
            categorical and {source.numericColumns.length} numeric columns.
          </>
        }
      />
    );
  }
  if (isLoading) return <AnalyticsLoading />;
  if (isError) return <AnalyticsError message={String((error as Error)?.message ?? error)} />;
  if (channels.length === 0) {
    return <MissingColumnsState detail={`No channel rows for "${categoryCol}".`} />;
  }

  const topChannels = [...channels].sort((a, b) => b.revenue - a.revenue);

  return (
    <div className="space-y-6">
      {/* Run panel */}
      <Card className="border-slate-800 bg-slate-900">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-100 mb-1">Revenue Attribution Analysis</h3>
              <p className="text-sm text-slate-400">
                Standardised multiple-linear-regression on per-channel drivers (volume, success
                rate, avg amount) → revenue. |β| = true attribution.
              </p>
            </div>
            <Button
              onClick={runAttribution}
              disabled={running}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {running ? (
                <>
                  <RefreshCw className="size-4 animate-spin" />
                  Fitting…
                </>
              ) : (
                <>
                  <DollarSign className="size-4" />
                  {attr ? "Re-run Attribution" : "Run Attribution"}
                </>
              )}
            </Button>
          </div>
          <p className="mt-3 text-xs text-slate-500 bg-slate-800/50 rounded px-3 py-2">
            {channels.length} channels from <b>{source.datasetName}</b> · target = {amountCol} ·
            total revenue {fmtRevenue(totalRevenue)} TND
          </p>
          {attrError && <p className="mt-2 text-xs text-red-400">{attrError}</p>}
        </CardContent>
      </Card>

      {attr && (
        <>
          {/* Attribution breakdown */}
          <Card className="border-slate-800 bg-slate-900">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <BarChart2 className="size-4 text-blue-400" />
                Attribution Breakdown
              </CardTitle>
              <CardDescription>
                Standardised driver contribution to revenue variation · model R² ={" "}
                {attr.rSquared.toFixed(3)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AnalyticsChart option={attributionOption} height={200} />
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                {attributionFactors.map((f) => (
                  <div key={f.factor} className="rounded-lg bg-slate-800/50 px-3 py-2">
                    <p className="text-xs font-medium text-slate-300">{f.factor}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{f.description}</p>
                    <p className="text-base font-bold text-blue-400 mt-1">
                      {f.attribution.toFixed(1)}%
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Revenue by channel (always real) */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="text-slate-100">Revenue by Channel</CardTitle>
          <CardDescription>Top channels by total revenue</CardDescription>
        </CardHeader>
        <CardContent>
          <AnalyticsChart option={revenueByChannelOption} height={280} />
        </CardContent>
      </Card>

      {/* Top drivers table */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="text-slate-100">Top Revenue Drivers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-2 px-3 text-slate-400 font-medium">Channel</th>
                  <th className="text-right py-2 px-3 text-slate-400 font-medium">Revenue</th>
                  <th className="text-right py-2 px-3 text-slate-400 font-medium">% of Total</th>
                  <th className="text-right py-2 px-3 text-slate-400 font-medium">Volume</th>
                  <th className="text-right py-2 px-3 text-slate-400 font-medium">Success</th>
                </tr>
              </thead>
              <tbody>
                {topChannels.slice(0, 15).map((row) => {
                  const pct = totalRevenue > 0 ? (row.revenue / totalRevenue) * 100 : 0;
                  return (
                    <tr
                      key={row.channel}
                      className="border-b border-slate-800 hover:bg-slate-800/30"
                    >
                      <td className="py-2 px-3 text-slate-200 font-medium">{row.channel}</td>
                      <td className="py-2 px-3 text-right text-slate-300 font-mono text-xs">
                        {fmtRevenue(row.revenue)} TND
                      </td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 rounded-full bg-slate-700 w-20">
                            <div
                              className="h-1.5 rounded-full bg-blue-500"
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                          <span className="text-slate-300 font-mono text-xs">
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right text-slate-300 font-mono text-xs">
                        {fmtInt(row.volume)}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <span className="inline-flex items-center gap-1 text-xs font-mono text-slate-300">
                          {row.successRate >= 85 && (
                            <TrendingUp className="size-3 text-emerald-400" />
                          )}
                          {fmtPct(row.successRate)}
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
    </div>
  );
}
