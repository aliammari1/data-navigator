"use client";

import { useEffect, useState } from "react";
import ReactECharts from "echarts-for-react";
import { AlertTriangle, BarChart2, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtAmount, fmtN } from "@/features/telecom/lib/format";
import type { ChannelDef } from "@/features/telecom/lib/report-engine";
import type { SpecChRow } from "@/features/telecom/lib/queries";

export function SpecChannelTable({
  channels,
  dateFrom,
  dateTo,
  title,
  fetchSpecChannelStats,
}: {
  channels: ChannelDef[];
  dateFrom: string;
  dateTo: string;
  title?: string;
  fetchSpecChannelStats: (
    channels: ChannelDef[],
    dateFrom: string,
    dateTo: string,
  ) => Promise<{ rows: SpecChRow[]; total: SpecChRow }>;
}) {
  const [data, setData] = useState<{
    rows: SpecChRow[];
    total: SpecChRow;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: channels is a stable module-level constant
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    fetchSpecChannelStats(channels, dateFrom, dateTo)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dateFrom, dateTo]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Chargement des données…
      </div>
    );
  }
  if (!data) return null;

  const sorted = [...data.rows].sort((a, b) => b.nombre - a.nombre);
  const maxNombre = Math.max(...sorted.map((r) => r.nombre), 1);
  const activeChannels = data.rows.filter((r) => r.nombre > 0).length;
  const topChannel = sorted[0];
  const top3Share =
    (sorted.slice(0, 3).reduce((a, r) => a + r.nombre, 0) /
      Math.max(data.total.nombre, 1)) *
    100;

  const hasData = data.total.nombre > 0;

  const chartOption = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: "#1e1e2e",
      borderColor: "#ffffff12",
      textStyle: { color: "#cdd6f4", fontSize: 11 },
      axisPointer: { type: "shadow" },
      formatter: (params: { name: string; value: number }[]) => {
        const p = params[0];
        const row = data.rows.find((r) => r.canal === p.name);
        const pct =
          data.total.nombre > 0
            ? ((p.value / data.total.nombre) * 100).toFixed(1)
            : "0.0";
        return `<b>${p.name}</b><br/>Transactions : <b>${fmtN(p.value)}</b> (${pct}%)<br/>Montant : <b>${fmtAmount(row?.montant ?? 0)} DT</b>`;
      },
    },
    grid: { left: 150, right: 70, top: 6, bottom: 6, containLabel: false },
    xAxis: {
      type: "value",
      axisLabel: { color: "#6c7086", fontSize: 9 },
      splitLine: { lineStyle: { color: "#ffffff08" } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: "category",
      data: sorted.map((r) => r.canal),
      axisLabel: {
        color: "#cdd6f4",
        fontSize: 10,
        width: 145,
        overflow: "truncate",
      },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    series: [
      {
        name: "Transactions",
        type: "bar",
        data: sorted.map((r) => ({
          value: r.nombre,
          itemStyle: {
            color:
              r.nombre === 0
                ? "#ffffff10"
                : {
                    type: "linear",
                    x: 0,
                    y: 0,
                    x2: 1,
                    y2: 0,
                    colorStops: [
                      { offset: 0, color: "#89b4fa" },
                      { offset: 1, color: "#b4befe" },
                    ],
                  },
            borderRadius: [0, 4, 4, 0],
          },
        })),
        barMaxWidth: 18,
        label: {
          show: true,
          position: "right",
          color: "#a6adc8",
          fontSize: 9,
          formatter: (p: { value: number }) =>
            p.value > 0 ? fmtN(p.value) : "",
        },
      },
    ],
  };

  return (
    <div className="space-y-4">
      {/* Optional sub-title */}
      {title && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-px bg-border/60" />
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-2">
            {title}
          </span>
          <div className="flex-1 h-px bg-border/60" />
        </div>
      )}

      {/* KPI mini-cards */}
      {hasData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            {
              label: "Transactions Totales",
              value: fmtN(data.total.nombre),
              sub: "réussies",
              color: "text-indigo-600 dark:text-indigo-400",
              border: "border-indigo-500/20",
              bg: "bg-indigo-500/8",
            },
            {
              label: "Montant Total",
              value: fmtAmount(data.total.montant),
              sub: "DT",
              color: "text-emerald-600 dark:text-emerald-400",
              border: "border-emerald-500/20",
              bg: "bg-emerald-500/8",
            },
            {
              label: "Canal Principal",
              value: topChannel?.canal ?? "—",
              sub: topChannel ? `${fmtN(topChannel.nombre)} tx` : "",
              color: "text-amber-600 dark:text-amber-400",
              border: "border-amber-500/20",
              bg: "bg-amber-500/8",
            },
            {
              label: "Canaux Actifs",
              value: `${activeChannels} / ${data.rows.length}`,
              sub: sorted.length > 3 ? `Top 3 = ${top3Share.toFixed(0)}%` : "",
              color: "text-violet-600 dark:text-violet-400",
              border: "border-violet-500/20",
              bg: "bg-violet-500/8",
            },
          ].map((k) => (
            <div
              key={k.label}
              className={cn(
                "rounded-xl border p-3 space-y-0.5",
                k.border,
                k.bg,
              )}
            >
              <div
                className={cn(
                  "text-base font-bold leading-tight tabular-nums truncate",
                  k.color,
                )}
              >
                {k.value}
              </div>
              <div className="text-[10px] text-muted-foreground">{k.label}</div>
              {k.sub && (
                <div className="text-[9px] text-muted-foreground/50">
                  {k.sub}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Horizontal bar chart — shown when ≥ 2 channels have data */}
      {hasData && sorted.filter((r) => r.nombre > 0).length >= 2 && (
        <div className="rounded-xl border border-border/50 bg-muted/10 overflow-hidden">
          <div className="px-3 pt-3 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <BarChart2 className="w-3 h-3" /> Distribution des transactions par
            canal
          </div>
          <ReactECharts
            option={chartOption}
            style={{
              height: `${Math.max(sorted.length * 30 + 24, 80)}px`,
            }}
            opts={{ renderer: "canvas" }}
          />
        </div>
      )}

      {/* Table with inline progress bars */}
      <div className="overflow-x-auto rounded-lg border border-border/50">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50 bg-muted/40">
              <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">
                CANAL
              </th>
              <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">
                Nombre Total
              </th>
              <th className="w-28 px-2 py-2.5 hidden sm:table-cell" />
              <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">
                Montant Total (DT)
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const pct = (row.nombre / maxNombre) * 100;
              return (
                <tr
                  key={`${row.canal}-${i}`}
                  className={cn(
                    "border-b border-border/30 last:border-0 transition-colors hover:bg-muted/20",
                    i % 2 !== 0 && "bg-muted/10",
                  )}
                >
                  <td className="px-3 py-2 text-foreground">{row.canal}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">
                    {row.nombre > 0 ? (
                      fmtN(row.nombre)
                    ) : (
                      <span className="text-muted-foreground/35">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2 hidden sm:table-cell">
                    <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500/80 to-blue-400/80 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-emerald-600 dark:text-emerald-400">
                    {row.montant > 0 ? (
                      fmtAmount(row.montant)
                    ) : (
                      <span className="text-muted-foreground/35">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted/50 border-t-2 border-border">
              <td className="px-3 py-2.5 font-bold text-foreground">
                {data.total.canal}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums font-bold text-foreground">
                {fmtN(data.total.nombre)}
              </td>
              <td className="px-2 py-2.5 hidden sm:table-cell" />
              <td className="px-3 py-2.5 text-right tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                {fmtAmount(data.total.montant)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Insight banners */}
      {hasData && activeChannels < data.rows.length && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700 dark:bg-amber-500/8 dark:border-amber-500/20 dark:text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-none" />
          <span>
            {data.rows.length - activeChannels} canal(aux) sans transactions sur
            cette période.
          </span>
        </div>
      )}
      {hasData && sorted.length > 3 && top3Share > 0 && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-indigo-50 border border-indigo-200 text-xs text-indigo-700 dark:bg-indigo-500/8 dark:border-indigo-500/15 dark:text-indigo-300">
          <Sparkles className="w-3.5 h-3.5 mt-0.5 flex-none" />
          <span>
            Top 3 (
            {sorted
              .slice(0, 3)
              .map((r) => r.canal)
              .join(", ")}
            ) représentent{" "}
            <strong className="text-indigo-200">{top3Share.toFixed(1)}%</strong>{" "}
            des transactions.
          </span>
        </div>
      )}
      {!hasData && (
        <div className="flex items-center justify-center py-6 text-xs text-muted-foreground/50">
          Aucune transaction réussie trouvée pour ce canal et cette période.
        </div>
      )}
    </div>
  );
}
