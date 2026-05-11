"use client";

import { ArrowDown, ArrowRight, ArrowUp, Scale } from "lucide-react";
import { useEffect, useState } from "react";
import { fmtAmount, fmtN, fmtPct } from "@/features/telecom/lib/format";
import {
  fetchPeriodKPI,
  type PeriodKPI,
} from "@/features/telecom/lib/period-queries";
import type { ColumnMapping } from "@/features/telecom/types";
import { PeriodFilterBar, type PeriodValue } from "./period-filter-bar";

function delta(a: number, b: number): number {
  if (b === 0) return a === 0 ? 0 : 100;
  return ((a - b) / b) * 100;
}

function DeltaBadge({ value, invert }: { value: number; invert?: boolean }) {
  const positive = invert ? value < 0 : value > 0;
  const negative = invert ? value > 0 : value < 0;
  const Icon = value > 0 ? ArrowUp : value < 0 ? ArrowDown : ArrowRight;
  const cls = positive
    ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/25"
    : negative
      ? "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/25"
      : "text-muted-foreground bg-muted border-border";
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${cls}`}
    >
      <Icon className="w-3 h-3" />
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

export function PeriodComparePanel({
  table,
  mapping,
  initialA,
  initialB,
}: {
  table: string;
  mapping: ColumnMapping;
  initialA: PeriodValue;
  initialB: PeriodValue;
}) {
  const [a, setA] = useState(initialA);
  const [b, setB] = useState(initialB);
  const [kpiA, setKpiA] = useState<PeriodKPI | null>(null);
  const [kpiB, setKpiB] = useState<PeriodKPI | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchPeriodKPI(table, mapping, a.from, a.to),
      fetchPeriodKPI(table, mapping, b.from, b.to),
    ]).then(([A, B]) => {
      if (!cancelled) {
        setKpiA(A);
        setKpiB(B);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [table, mapping, a, b]);

  const rows: Array<{
    label: string;
    A: number;
    B: number;
    fmt: (n: number) => string;
    invert?: boolean;
  }> =
    kpiA && kpiB
      ? [
          {
            label: "Total transactions",
            A: kpiA.total,
            B: kpiB.total,
            fmt: fmtN,
          },
          {
            label: "Réussies",
            A: kpiA.success,
            B: kpiB.success,
            fmt: fmtN,
          },
          {
            label: "Échec",
            A: kpiA.declined,
            B: kpiB.declined,
            fmt: fmtN,
            invert: true,
          },
          {
            label: "Annulation",
            A: kpiA.refund,
            B: kpiB.refund,
            fmt: fmtN,
            invert: true,
          },
          {
            label: "Instance",
            A: kpiA.instance,
            B: kpiB.instance,
            fmt: fmtN,
            invert: true,
          },
          {
            label: "Taux réussite",
            A: kpiA.successRate,
            B: kpiB.successRate,
            fmt: (n) => fmtPct(n),
          },
          {
            label: "Montant (TND)",
            A: kpiA.amount,
            B: kpiB.amount,
            fmt: (n) => `${fmtAmount(n)}`,
          },
          {
            label: "Montant moyen",
            A: kpiA.avgAmount,
            B: kpiB.avgAmount,
            fmt: (n) => fmtAmount(n),
          },
          {
            label: "Abonnés uniques",
            A: kpiA.uniqueCustomers,
            B: kpiB.uniqueCustomers,
            fmt: fmtN,
          },
        ]
      : [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Scale className="w-4 h-4 text-violet-500" />
        <span className="text-sm font-semibold text-foreground">
          Comparaison de périodes
        </span>
        <span className="text-xs text-muted-foreground">
          A vs B — delta calculé sur la période A
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div>
          <div className="text-[10px] uppercase font-bold tracking-wide text-indigo-600 dark:text-indigo-400 mb-1">
            Période A
          </div>
          <PeriodFilterBar value={a} onChange={setA} />
        </div>
        <div>
          <div className="text-[10px] uppercase font-bold tracking-wide text-fuchsia-600 dark:text-fuchsia-400 mb-1">
            Période B (référence)
          </div>
          <PeriodFilterBar value={b} onChange={setB} />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-3 py-2 text-left text-[10px] uppercase font-semibold text-muted-foreground">
                Indicateur
              </th>
              <th className="px-3 py-2 text-right text-[10px] uppercase font-semibold text-indigo-600 dark:text-indigo-400">
                A
              </th>
              <th className="px-3 py-2 text-right text-[10px] uppercase font-semibold text-fuchsia-600 dark:text-fuchsia-400">
                B
              </th>
              <th className="px-3 py-2 text-right text-[10px] uppercase font-semibold text-muted-foreground">
                Δ A vs B
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.label}
                className="border-b border-border last:border-0"
              >
                <td className="px-3 py-2 text-foreground font-medium">
                  {r.label}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-foreground">
                  {r.fmt(r.A)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {r.fmt(r.B)}
                </td>
                <td className="px-3 py-2 text-right">
                  <DeltaBadge value={delta(r.A, r.B)} invert={r.invert} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-6 text-center text-xs text-muted-foreground"
                >
                  {loading ? "Calcul…" : "Aucune donnée."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
