"use client";

import { Loader2 } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import { EChart } from "@/features/telecom/components/echart";
import { buildDailyTrendOption } from "@/features/telecom/lib/chart-options";
import { fmtN, fmtPct, movingAverage } from "@/features/telecom/lib/format";
import type * as Types from "@/features/telecom/types";
import { cn } from "@/shared/utils";

type FetchDailyTrend = (m: Types.ColumnMapping) => Promise<Types.DailyTrendRow[]>;

export const DailyTrendChart = memo(function DailyTrendChart({
  m,
  fetchDailyTrend,
}: {
  m: Types.ColumnMapping;
  fetchDailyTrend: FetchDailyTrend;
}) {
  const [data, setData] = useState<Types.DailyTrendRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: m is stable after load
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchDailyTrend(m)
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const chartData = useMemo(() => {
    if (!data || data.length < 2) return null;

    const labels = data.map((r) => r.day.slice(5));
    const rates = data.map((r) => (r.total > 0 ? +((r.success / r.total) * 100).toFixed(1) : 0));
    const totals = data.map((r) => r.total);
    const maWindow = Math.min(3, totals.length);
    const maValues = maWindow >= 2 ? movingAverage(totals, maWindow) : [];
    const maSeries: (number | null)[] = [...Array(maWindow - 1).fill(null), ...maValues];

    const totalTx = data.reduce((a, r) => a + r.total, 0);
    const avgRate =
      (data.reduce((a, r) => a + (r.total > 0 ? r.success / r.total : 0), 0) / data.length) * 100;

    const option = buildDailyTrendOption(data, labels, rates, maSeries, maValues);

    return { data, labels, totalTx, avgRate, option };
  }, [data]);

  if (loading)
    return (
      <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyse multi-jours…
      </div>
    );
  if (!chartData) return null;

  const { data: d, totalTx, avgRate, option } = chartData;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-xs flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Période :</span>
          <span className="font-semibold text-foreground">
            {d[0].day} → {d[d.length - 1].day}
          </span>
        </div>
        <div className="w-px h-3 bg-border" />
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">{d.length} jours ·</span>
          <span className="font-bold text-primary tabular-nums">{fmtN(totalTx)} tx</span>
        </div>
        <div className="w-px h-3 bg-border" />
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Taux moyen :</span>
          <span
            className={cn(
              "font-bold tabular-nums",
              avgRate >= 95
                ? "text-emerald-600 dark:text-emerald-400"
                : avgRate >= 80
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-red-600 dark:text-red-400",
            )}
          >
            {fmtPct(avgRate)}
          </span>
        </div>
      </div>
      <div className="rounded-xl border border-border/50 bg-muted/10 overflow-hidden">
        <EChart option={option} height={220} />
      </div>
    </div>
  );
});
