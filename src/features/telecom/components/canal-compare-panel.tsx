"use client";

import { BarChart2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { EChart } from "@/features/telecom/components/echart";
import { COMPARE_GROUPS } from "@/features/telecom/lib/canal-groups";
import { buildCanalCompareBarOption } from "@/features/telecom/lib/chart-options";
import { fmtAmount, fmtN } from "@/features/telecom/lib/format";
import type { SpecChRow } from "@/features/telecom/lib/queries";
import type { ChannelDef } from "@/features/telecom/lib/report-engine";
import { cn } from "@/shared/utils";

export { COMPARE_GROUPS } from "@/features/telecom/lib/canal-groups";

export function CanalComparePanel({
  dateFrom,
  dateTo,
  fetchSpecChannelStats,
}: {
  dateFrom: string;
  dateTo: string;
  fetchSpecChannelStats: (
    channels: ChannelDef[],
    dateFrom: string,
    dateTo: string,
  ) => Promise<{ rows: SpecChRow[]; total: SpecChRow }>;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set([0, 1]));
  const [results, setResults] = useState<Array<{
    label: string;
    nombre: number;
    montant: number;
    activeCount: number;
    color: string;
  }> | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) {
        if (next.size > 1) next.delete(i);
      } else {
        if (next.size < 4) next.add(i);
      }
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const groups = [...selected].map((i) => COMPARE_GROUPS[i]).filter(Boolean);
    Promise.all(
      groups.map(async (g) => {
        const res = await fetchSpecChannelStats(g.channels, dateFrom, dateTo);
        const activeCount = res.rows.filter((r) => r.nombre > 0).length;
        return {
          label: g.label,
          nombre: res.total.nombre,
          montant: res.total.montant,
          activeCount,
          color: g.color ?? "#89b4fa",
        };
      }),
    )
      .then((r) => {
        if (!cancelled) setResults(r);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, dateFrom, dateTo, fetchSpecChannelStats]);

  const maxNombre = Math.max(...(results?.map((r) => r.nombre) ?? [1]), 1);
  const maxMontant = Math.max(...(results?.map((r) => r.montant) ?? [1]), 1);

  const metrics = [
    {
      key: "nombre" as const,
      label: "Transactions",
      fmt: fmtN,
      max: maxNombre,
      color: "bg-indigo-500",
    },
    {
      key: "montant" as const,
      label: "Montant (DT)",
      fmt: fmtAmount,
      max: maxMontant,
      color: "bg-emerald-500",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Canal selector */}
      <div className="flex flex-wrap gap-2">
        {COMPARE_GROUPS.map((g, i) => {
          const sel = selected.has(i);
          return (
            <button
              key={g.label}
              type="button"
              onClick={() => toggle(i)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all duration-150",
                sel
                  ? "border-transparent text-background"
                  : "border-border/60 text-muted-foreground hover:text-foreground hover:border-border",
              )}
              style={sel ? { backgroundColor: g.color } : undefined}
            >
              <div
                className="w-2 h-2 rounded-full flex-none"
                style={{ backgroundColor: sel ? "rgba(0,0,0,0.3)" : g.color }}
              />
              {g.label}
            </button>
          );
        })}
        <div className="ml-auto text-[10px] text-muted-foreground self-center">
          {selected.size} / 4 sélectionnés
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Comparaison en cours…
        </div>
      )}

      {!loading && results && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Bar chart */}
          {results && (
            <div className="rounded-xl border border-border/50 bg-muted/10 overflow-hidden">
              <div className="px-3 pt-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <BarChart2 className="w-3 h-3" /> Volume des transactions réussies
              </div>
              <EChart option={buildCanalCompareBarOption(results)} height={220} />
            </div>
          )}

          {/* Scorecard table */}
          <div className="rounded-xl border border-border/50 bg-muted/10 overflow-hidden">
            <div className="px-3 pt-2.5 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Tableau comparatif
            </div>
            <div className="divide-y divide-border/30">
              {metrics.map((met) => (
                <div key={met.key} className="px-3 py-2">
                  <div className="text-[10px] text-muted-foreground mb-1.5">{met.label}</div>
                  <div className="space-y-1.5">
                    {[...results]
                      .sort((a, b) => b[met.key] - a[met.key])
                      .map((r, rank) => (
                        <div key={r.label} className="flex items-center gap-2">
                          {rank === 0 && (
                            <span className="text-[9px] text-amber-600 dark:text-amber-400 font-bold w-3">
                              ▲
                            </span>
                          )}
                          {rank !== 0 && <span className="w-3" />}
                          <div
                            className="w-2 h-2 rounded-full flex-none"
                            style={{ backgroundColor: r.color }}
                          />
                          <span className="text-[11px] text-foreground truncate flex-1 min-w-0">
                            {r.label}
                          </span>
                          <span className="text-[11px] tabular-nums text-muted-foreground flex-none">
                            {met.fmt(r[met.key])}
                          </span>
                          <div className="w-16 h-1 bg-muted/60 rounded-full overflow-hidden flex-none">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${(r[met.key] / met.max) * 100}%`,
                                backgroundColor: r.color,
                                opacity: 0.8,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
