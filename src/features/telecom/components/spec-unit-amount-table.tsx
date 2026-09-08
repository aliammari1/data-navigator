"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { fmtAmount, fmtN } from "@/features/telecom/lib/format";
import type { ChannelDef } from "@/features/telecom/lib/report-engine";
import type { SpecUnitAmountResult } from "@/features/telecom/types";

export function SpecUnitAmountTable({
  channels,
  dateFrom,
  dateTo,
  fetchSpecUnitAmountStats,
}: {
  channels: ChannelDef[];
  dateFrom: string;
  dateTo: string;
  fetchSpecUnitAmountStats: (
    channels: ChannelDef[],
    dateFrom: string,
    dateTo: string,
  ) => Promise<SpecUnitAmountResult>;
}) {
  const [data, setData] = useState<SpecUnitAmountResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchSpecUnitAmountStats(channels, dateFrom, dateTo)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [channels, dateFrom, dateTo, fetchSpecUnitAmountStats]);

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Calcul par montant unitaire…
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/50 border-b border-border">
            <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Unit Amount
            </th>
            <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Nombre Total
            </th>
            <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Montant Total (DT)
            </th>
          </tr>
        </thead>
        <tbody>
          {[...(data?.rows ?? []), ...(data ? [data.total] : [])].map((row) => (
            <tr key={row.unitAmount} className="border-b border-border">
              <td className="px-3 py-2.5 font-medium text-foreground">{row.unitAmount}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-foreground font-semibold">
                {fmtN(row.nombre)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-foreground font-semibold">
                {fmtAmount(row.montant)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
