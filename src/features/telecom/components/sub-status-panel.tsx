"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Send,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fmtAmount, fmtN, fmtPct } from "@/features/telecom/lib/format";
import {
  fetchSubStatusBreakdown,
  type SubStatusRow,
} from "@/features/telecom/lib/period-queries";
import type { ColumnMapping } from "@/features/telecom/types";

const PARENT_META: Record<
  string,
  { label: string; icon: React.ElementType; color: string; bg: string }
> = {
  SUCCESS: {
    label: "Réussie",
    icon: CheckCircle2,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/25",
  },
  INSTANCE: {
    label: "Instance (Hold + Doubt)",
    icon: Clock,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/25",
  },
  REFUND: {
    label: "Annulation (Refund)",
    icon: RefreshCw,
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-500/10 border-violet-200 dark:border-violet-500/25",
  },
  DECLINED: {
    label: "Échec",
    icon: XCircle,
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/25",
  },
  SUBMITTED: {
    label: "Confirmé",
    icon: Send,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/25",
  },
};

export function SubStatusPanel({
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
  const [rows, setRows] = useState<SubStatusRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!table || !mapping?.transactionDate || !dateFrom || !dateTo) return;

    let cancelled = false;

    setLoading(true);

    fetchSubStatusBreakdown(table, mapping, dateFrom, dateTo).then(
      (nextRows) => {
        if (!cancelled) {
          setRows(nextRows);
          setLoading(false);
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [table, mapping, dateFrom, dateTo]);
  const grouped = useMemo(() => {
    const m = new Map<string, SubStatusRow[]>();
    for (const r of rows) {
      const arr = m.get(r.parent) ?? [];
      arr.push(r);
      m.set(r.parent, arr);
    }
    for (const [, arr] of m) arr.sort((a, b) => b.count - a.count);
    return m;
  }, [rows]);

  const totals = useMemo(() => {
    const t: Record<string, { n: number; amt: number }> = {};
    for (const r of rows) {
      const cur = t[r.parent] ?? { n: 0, amt: 0 };
      cur.n += r.count;
      cur.amt += r.amount;
      t[r.parent] = cur;
    }
    return t;
  }, [rows]);

  if (loading && rows.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="text-xs text-muted-foreground animate-pulse">
          Calcul des sous-statuts…
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-xs text-muted-foreground">
        Aucune donnée pour la période.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Object.entries(PARENT_META).map(([key, meta]) => {
          const t = totals[key] ?? { n: 0, amt: 0 };
          const Icon = meta.icon;
          return (
            <div key={key} className={`rounded-xl border p-3 ${meta.bg}`}>
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                <span className="text-[11px] font-semibold text-foreground">
                  {meta.label}
                </span>
              </div>
              <div className="text-xl font-black tabular-nums">{fmtN(t.n)}</div>
              <div className="text-[10px] text-muted-foreground tabular-nums">
                {fmtAmount(t.amt)} TND
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-xs font-semibold">
            Détail par sous-statut (per spec)
          </span>
          <span className="text-[10px] text-muted-foreground ml-auto">
            {rows.length} codes actifs
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x divide-border">
          {Object.entries(PARENT_META).map(([parent, meta]) => {
            const list = grouped.get(parent) ?? [];
            if (list.length === 0) return null;
            return (
              <div key={parent} className="p-3 space-y-1.5">
                <div
                  className={`text-[10px] uppercase font-bold tracking-wide ${meta.color}`}
                >
                  {meta.label}
                </div>
                {list.map((r) => (
                  <div
                    key={r.code}
                    className="flex items-center justify-between text-xs gap-2"
                  >
                    <span className="font-mono text-foreground">{r.code}</span>
                    <div className="flex items-center gap-3 text-muted-foreground tabular-nums">
                      <span className="text-foreground font-medium">
                        {fmtN(r.count)}
                      </span>
                      <span className="text-[10px] w-12 text-right">
                        {fmtPct(r.share)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
