"use client";

import type { AnomalyHit } from "@/features/auto-analyst/core/types";

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return Number.isInteger(n) ? n.toString() : n.toFixed(2);
}

export function StepAnomalies({ hits }: { hits: AnomalyHit[] }) {
  if (!hits.length)
    return (
      <p className="text-sm text-[var(--atlas-text-subtle)]">
        No anomalies detected by z-score or Hampel rules.
      </p>
    );
  const grouped = hits.reduce<Record<string, AnomalyHit[]>>((acc, h) => {
    acc[h.column] ??= [];
    acc[h.column].push(h);
    return acc;
  }, {});
  return (
    <div className="space-y-3">
      {Object.entries(grouped).map(([col, list]) => (
        <div
          key={col}
          className="rounded-[var(--atlas-radius-3)] border border-[var(--atlas-border)] overflow-hidden"
        >
          <div className="flex items-center justify-between px-3 py-2 bg-[var(--atlas-surface)] border-b border-[var(--atlas-border)]">
            <div className="text-sm font-semibold text-[var(--atlas-text)]">
              {col}
            </div>
            <div className="text-[11px] text-[var(--atlas-text-subtle)]">
              {list.length} flagged · max |z| ={" "}
              {Math.abs(list[0].zScore).toFixed(1)}
            </div>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-[var(--atlas-bg-subtle)]">
              <tr className="text-left text-[10px] uppercase tracking-wide text-[var(--atlas-text-subtle)]">
                <th className="px-3 py-1.5">Row</th>
                <th className="px-3 py-1.5 text-right">Value</th>
                <th className="px-3 py-1.5 text-right">|z|</th>
                <th className="px-3 py-1.5">Reason</th>
              </tr>
            </thead>
            <tbody className="text-[var(--atlas-text)]">
              {list.slice(0, 10).map((h) => (
                <tr
                  key={h.id}
                  className="border-t border-[var(--atlas-border)]"
                >
                  <td className="px-3 py-1.5 font-mono text-[10px] text-[var(--atlas-text-subtle)]">
                    {String(h.rowId)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                    {fmt(h.value)}
                  </td>
                  <td
                    className={`px-3 py-1.5 text-right font-mono tabular-nums ${Math.abs(h.zScore) > 5 ? "text-[var(--atlas-danger-fg)]" : "text-[var(--atlas-warning-fg)]"}`}
                  >
                    {Math.abs(h.zScore).toFixed(1)}
                  </td>
                  <td className="px-3 py-1.5 text-[10px] uppercase text-[var(--atlas-text-subtle)]">
                    {h.reason}
                  </td>
                </tr>
              ))}
              {list.length > 10 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-1.5 text-[11px] text-[var(--atlas-text-subtle)] text-center"
                  >
                    + {list.length - 10} more
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
