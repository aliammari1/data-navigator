"use client";

import { Loader2 } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import { EChart } from "@/features/telecom/components/echart";
import { CHART_PALETTE } from "@/features/telecom/lib/canal-config";
import type { ChannelGroup } from "@/features/telecom/lib/canal-groups";
import {
  buildGroupSummaryDonutOption,
  buildGroupSummaryHbarOption,
} from "@/features/telecom/lib/chart-options";
import { fmtAmount, fmtN } from "@/features/telecom/lib/format";
import type { ChannelDef } from "@/features/telecom/lib/report-engine";

export type { ChannelGroup } from "@/features/telecom/lib/canal-groups";

// Memoized inner chart components to prevent option rebuilds
const MemoDonutChart = memo(function MemoDonutChart({
  data,
}: {
  data: Array<{ label: string; nombre: number; montant: number; color: string }>;
}) {
  const option = useMemo(() => buildGroupSummaryDonutOption(data), [data]);
  return <EChart option={option} height={170} />;
});

const MemoHbarChart = memo(function MemoHbarChart({
  data,
}: {
  data: Array<{ label: string; nombre: number; montant: number; color: string }>;
}) {
  const option = useMemo(() => buildGroupSummaryHbarOption(data), [data]);
  return <EChart option={option} height={data.length * 28 + 20} />;
});

type FetchSpecChannelStats = (
  channels: ChannelDef[],
  dateFrom: string,
  dateTo: string,
) => Promise<{
  rows: { canal: string; nombre: number; montant: number }[];
  total: { canal: string; nombre: number; montant: number };
}>;

export const GroupSummaryChart = memo(function GroupSummaryChart({
  groups,
  dateFrom,
  dateTo,
  fetchSpecChannelStats,
}: Readonly<{
  groups: ChannelGroup[];
  dateFrom: string;
  dateTo: string;
  fetchSpecChannelStats: FetchSpecChannelStats;
}>) {
  const [data, setData] = useState<Array<{
    label: string;
    nombre: number;
    montant: number;
    color: string;
  }> | null>(null);
  const [loading, setLoading] = useState(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: groups is a stable module-level constant
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    // Timeout: stop loading after 12s if query hangs (table not loaded, etc.)
    const timeoutId = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 12000);

    Promise.all(
      groups.map(async (g, i) => {
        const res = await fetchSpecChannelStats(g.channels, dateFrom, dateTo);
        return {
          label: g.label,
          nombre: res.total.nombre,
          montant: res.total.montant,
          color: g.color ?? CHART_PALETTE[i % CHART_PALETTE.length],
        };
      }),
    )
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch(() => {})
      .finally(() => {
        clearTimeout(timeoutId);
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [dateFrom, dateTo]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" /> Calcul du résumé…
      </div>
    );
  }
  if (!data || data.every((d) => d.nombre === 0)) return null;

  const totalN = data.reduce((a, d) => a + d.nombre, 0);
  const totalM = data.reduce((a, d) => a + d.montant, 0);
  const maxN = Math.max(...data.map((d) => d.nombre), 1);
  const useDonut = groups.length <= 5;

  return (
    <div className="rounded-xl border border-border/40 bg-muted/10 overflow-hidden">
      {/* Header pills */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 border-b border-border/30 bg-muted/20">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Total</span>
          <span className="font-bold text-foreground tabular-nums">
            {fmtN(totalN)} tx
          </span>
        </div>
        <div className="w-px h-3 bg-border" />
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Montant</span>
          <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {fmtAmount(totalM)} DT
          </span>
        </div>
        <div className="flex items-center gap-3 ml-auto flex-wrap">
          {data.map((d) => (
            <div
              key={d.label}
              className="flex items-center gap-1 text-[10px] text-muted-foreground"
            >
              <div
                className="w-2 h-2 rounded-full flex-none"
                style={{ backgroundColor: d.color }}
              />
              <span>
                {d.label}:{" "}
                <span className="text-foreground font-semibold tabular-nums">
                  {fmtN(d.nombre)}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 divide-x divide-border/30">
        {/* Donut or hbar */}
        <div>
          {useDonut ? (
            <MemoDonutChart data={data} />
          ) : (
            <MemoHbarChart data={data} />
          )}
        </div>

        {/* Mini comparison table */}
        <div className="px-4 py-3 flex flex-col justify-center">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Comparaison
          </div>
          <div className="space-y-2">
            {data.map((d) => {
              const pct = totalN > 0 ? (d.nombre / totalN) * 100 : 0;
              return (
                <div key={d.label} className="space-y-0.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div
                        className="w-2 h-2 rounded-full flex-none"
                        style={{ backgroundColor: d.color }}
                      />
                      <span className="text-foreground truncate">
                        {d.label}
                      </span>
                    </div>
                    <span className="text-muted-foreground tabular-nums ml-2 flex-none">
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${(d.nombre / maxN) * 100}%`,
                        backgroundColor: d.color,
                        opacity: 0.8,
                      }}
                    />
                  </div>
                  <div className="text-[9px] text-muted-foreground/60 tabular-nums">
                    {fmtAmount(d.montant)} DT
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});
