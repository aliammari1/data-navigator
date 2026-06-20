"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { fmtN } from "@/features/telecom/lib/format";
import type { ChannelDef } from "@/features/telecom/lib/report-engine";
import type { SpecStatusResult } from "@/features/telecom/types";

export function SpecStatusTable({
  channels,
  dateFrom,
  dateTo,
  fetchSpecStatusStats,
}: {
  channels: ChannelDef[];
  dateFrom: string;
  dateTo: string;
  fetchSpecStatusStats: (
    channels: ChannelDef[],
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
          {[...(data?.rows ?? []), ...(data ? [data.total] : [])].map((row) => (
            <tr key={row.status} className="border-b border-border">
              <td className="px-3 py-2.5 font-medium text-foreground">{row.status}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-foreground font-semibold">
                {fmtN(row.nombre)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
