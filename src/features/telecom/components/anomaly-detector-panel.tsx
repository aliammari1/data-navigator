"use client";

import { AlertOctagon, Bell, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { fmtN, fmtPct } from "@/features/telecom/lib/format";
import { fetchAnomalies, type RowAnomaly } from "@/features/telecom/lib/period-queries";
import type { ColumnMapping } from "@/features/telecom/types";

export function AnomalyDetectorPanel({
  table,
  mapping,
  dateFrom,
  dateTo,
}: {
  table: string;
  mapping: ColumnMapping;
  dateFrom: string;
  dateTo: string;
}) {
  const [rows, setRows] = useState<RowAnomaly[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    fetchAnomalies(table, mapping, dateFrom, dateTo)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [table, mapping, dateFrom, dateTo]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const sevColor = (z: number) =>
    z >= 4
      ? "border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300"
      : z >= 3
        ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
        : "border-yellow-300 bg-yellow-50 text-yellow-700 dark:border-yellow-500/40 dark:bg-yellow-500/10 dark:text-yellow-300";

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
        <AlertOctagon className="w-3.5 h-3.5 text-red-500" />
        <span className="text-xs font-semibold">Anomalies détectées (z-score canal × heure)</span>
        <span className="text-[10px] text-muted-foreground ml-2">{rows.length} cas</span>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="ml-auto h-6 w-6 rounded border border-border hover:bg-muted flex items-center justify-center"
          title="Recalculer"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="max-h-[360px] overflow-y-auto divide-y divide-border">
        {rows.length === 0 && !loading && (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            <Bell className="w-4 h-4 mx-auto mb-1 text-emerald-500" />
            Aucune anomalie sur la période. Tout va bien.
          </div>
        )}
        {rows.map((r) => (
          <div
            key={`${r.canal}-${r.hour}`}
            className="px-4 py-2.5 flex items-center gap-3 hover:bg-muted/30"
          >
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${sevColor(r.z)}`}>
              z={r.z.toFixed(1)}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-foreground truncate">
                {r.canal} · {String(r.hour).padStart(2, "0")}h
              </div>
              <div className="text-[10px] text-muted-foreground">{r.reason}</div>
            </div>
            <div className="text-right text-xs tabular-nums">
              <div className="text-foreground font-medium">{fmtN(r.total)} tx</div>
              <div
                className={
                  r.successRate >= 90
                    ? "text-emerald-600 dark:text-emerald-400 text-[10px]"
                    : "text-red-600 dark:text-red-400 text-[10px]"
                }
              >
                {fmtPct(r.successRate)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
