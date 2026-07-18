"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { fmtN } from "@/features/telecom/lib/format";
import type { CanalRule, SpecStatusResult } from "@/features/telecom/types";
import { cn } from "@/shared/utils";

const STATUS_COLOR: Record<string, string> = {
  Réussie: "text-emerald-600 dark:text-emerald-400",
  Annulation: "text-sky-600 dark:text-sky-400",
  "Instance (Hold + Doubt)": "text-orange-600 dark:text-orange-400",
  Échec: "text-red-600 dark:text-red-400",
  Confirmé: "text-blue-600 dark:text-blue-400",
};

const STATUS_DOT: Record<string, string> = {
  Réussie: "bg-emerald-500",
  Annulation: "bg-sky-500",
  "Instance (Hold + Doubt)": "bg-orange-500",
  Échec: "bg-red-500",
  Confirmé: "bg-blue-500",
};

export function SpecStatusTable({
  channels,
  dateFrom,
  dateTo,
  fetchSpecStatusStats,
}: {
  channels: CanalRule[];
  dateFrom: string;
  dateTo: string;
  fetchSpecStatusStats: (
    channels: CanalRule[],
    dateFrom: string,
    dateTo: string,
  ) => Promise<SpecStatusResult>;
}) {
  const [data, setData] = useState<SpecStatusResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchSpecStatusStats(channels, dateFrom, dateTo)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [channels, dateFrom, dateTo, fetchSpecStatusStats]);

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Calcul des statuts…
      </div>
    );
  }

  const rows = data?.rows ?? [];
  const total = data?.total;

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/50 border-b border-border">
            <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Status
            </th>
            <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Total Number
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const textColor = STATUS_COLOR[row.status] ?? "text-foreground";
            const dotColor = STATUS_DOT[row.status] ?? "bg-muted-foreground";
            return (
              <tr
                key={row.status}
                className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
              >
                <td className={cn("px-3 py-2.5 font-medium flex items-center gap-2", textColor)}>
                  <span className={cn("inline-block w-2 h-2 rounded-full flex-none", dotColor)} />
                  {row.status}
                </td>
                <td className={cn("px-3 py-2.5 text-right tabular-nums font-semibold", textColor)}>
                  {fmtN(row.nombre)}
                </td>
              </tr>
            );
          })}
        </tbody>
        {total && (
          <tfoot>
            <tr className="bg-muted/50 border-t-2 border-border">
              <td className="px-3 py-2.5 font-bold text-foreground">{total.status}</td>
              <td className="px-3 py-2.5 text-right tabular-nums font-bold text-foreground">
                {fmtN(total.nombre)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
