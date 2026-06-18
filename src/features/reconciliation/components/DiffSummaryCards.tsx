"use client";

/**
 * Diff summary cards — every number sourced from the DuckDB rollup
 * (`useDiffSummary` → `buildSummarySQL`), never recomputed in render and never
 * fabricated. Replaces the legacy `useMemo` reductions over a hardcoded array.
 */

import {
  CheckCircle2,
  MinusCircle,
  PlusCircle,
  TriangleAlert,
} from "lucide-react";
import type { DiffSummary } from "../lib/use-reconciliation";

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

const CARDS = [
  {
    key: "rowsChanged" as const,
    label: "Changed",
    icon: TriangleAlert,
    accent: "text-amber-400",
    ring: "border-amber-500/30",
  },
  {
    key: "rowsAdded" as const,
    label: "Added (actual only)",
    icon: PlusCircle,
    accent: "text-emerald-400",
    ring: "border-emerald-500/30",
  },
  {
    key: "rowsRemoved" as const,
    label: "Removed (expected only)",
    icon: MinusCircle,
    accent: "text-red-400",
    ring: "border-red-500/30",
  },
  {
    key: "rowsUnchanged" as const,
    label: "Unchanged",
    icon: CheckCircle2,
    accent: "text-slate-400",
    ring: "border-slate-600/40",
  },
];

export function DiffSummaryCards({
  summary,
  loading,
}: {
  summary: DiffSummary | null;
  loading?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map((card) => {
          const Icon = card.icon;
          const value = summary?.[card.key] ?? 0;
          return (
            <div
              key={card.key}
              className={`rounded-lg border bg-slate-900/40 p-4 ${card.ring}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">
                  {card.label}
                </span>
                <Icon className={`size-4 ${card.accent}`} />
              </div>
              <div className={`mt-2 text-2xl font-bold ${card.accent}`}>
                {loading ? "…" : fmt(value)}
              </div>
            </div>
          );
        })}
      </div>

      {summary && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3 text-xs text-slate-400">
          <span>
            <strong className="text-slate-200">{fmt(summary.rowsTotal)}</strong>{" "}
            matched keys
          </span>
          <span>
            <strong className="text-amber-300">
              {fmt(summary.rowsMaterial)}
            </strong>{" "}
            material
          </span>
          {Object.entries(summary.totals).map(([label, t]) => (
            <span key={label}>
              Σ {label}:{" "}
              <strong
                className={
                  t.sumVariance > 0
                    ? "text-emerald-300"
                    : t.sumVariance < 0
                      ? "text-red-300"
                      : "text-slate-200"
                }
              >
                {t.sumVariance >= 0 ? "+" : ""}
                {fmt(Math.round(t.sumVariance))}
              </strong>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
