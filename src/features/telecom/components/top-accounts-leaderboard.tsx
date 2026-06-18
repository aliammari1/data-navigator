"use client";

import { Crown, TrendingUp, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { fmtAmount, fmtN, fmtPct } from "@/features/telecom/lib/format";
import {
  fetchTopAccounts,
  type TopAccountRow,
} from "@/features/telecom/lib/period-queries";
import type { ColumnMapping } from "@/features/telecom/types";

export function TopAccountsLeaderboard({
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
  const [by, setBy] = useState<"amount" | "count">("amount");
  const [rows, setRows] = useState<TopAccountRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTopAccounts(table, mapping, dateFrom, dateTo, 25, by).then((r) => {
      if (!cancelled) {
        setRows(r);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [table, mapping, dateFrom, dateTo, by]);

  const max = rows[0] ? (by === "amount" ? rows[0].amount : rows[0].total) : 1;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
        <Crown className="w-3.5 h-3.5 text-amber-500" />
        <span className="text-xs font-semibold">Top abonnés</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setBy("amount")}
            className={`h-6 px-2 rounded text-[10px] font-medium border ${
              by === "amount"
                ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            <TrendingUp className="w-3 h-3 inline mr-0.5" /> Montant
          </button>
          <button
            type="button"
            onClick={() => setBy("count")}
            className={`h-6 px-2 rounded text-[10px] font-medium border ${
              by === "count"
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            <Users className="w-3 h-3 inline mr-0.5" /> Volume
          </button>
        </div>
      </div>

      <div className="max-h-[420px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/60 backdrop-blur">
            <tr className="border-b border-border">
              {[
                "#",
                "MSISDN",
                "Nom",
                "Tx",
                "Réussite",
                "Montant",
                "Canal favori",
              ].map((h) => (
                <th
                  key={h}
                  className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-muted-foreground font-semibold"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const value = by === "amount" ? r.amount : r.total;
              const pct = max > 0 ? (value / max) * 100 : 0;
              return (
                <tr
                  key={r.msisdn}
                  className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors"
                >
                  <td className="px-3 py-2 text-muted-foreground tabular-nums w-8">
                    {i + 1}
                  </td>
                  <td className="px-3 py-2 font-mono text-foreground">
                    {r.msisdn}
                  </td>
                  <td className="px-3 py-2 text-foreground truncate max-w-45">
                    {r.name}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-foreground">
                    {fmtN(r.total)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    <span
                      className={
                        r.successRate >= 90
                          ? "text-emerald-600 dark:text-emerald-400"
                          : r.successRate >= 70
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-red-600 dark:text-red-400"
                      }
                    >
                      {fmtPct(r.successRate)}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-foreground">
                    <div className="flex items-center gap-2">
                      <span>{fmtAmount(r.amount)}</span>
                      <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden min-w-[40px]">
                        <div
                          className="h-full bg-amber-500 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground text-[10px] truncate max-w-[140px]">
                    {r.favCanal}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-6 text-center text-xs text-muted-foreground"
                >
                  Aucun abonné.
                </td>
              </tr>
            )}
            {loading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-6 text-center text-xs text-muted-foreground animate-pulse"
                >
                  Chargement…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
