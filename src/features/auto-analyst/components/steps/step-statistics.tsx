"use client";

import { AtlasChip } from "@/design/primitives/chip";
import type { StatTest } from "@/features/auto-analyst/core/types";

export function StepStatistics({ tests }: { tests: StatTest[] }) {
  if (!tests.length)
    return (
      <p className="text-sm text-[var(--atlas-text-subtle)]">
        Need at least 30 rows per pair to run statistical tests.
      </p>
    );
  return (
    <div className="overflow-x-auto rounded-[var(--atlas-radius-3)] border border-[var(--atlas-border)]">
      <table className="w-full text-xs">
        <thead className="bg-[var(--atlas-surface)]">
          <tr className="text-left text-[10px] uppercase tracking-wide text-[var(--atlas-text-subtle)]">
            <th className="px-3 py-2">Variables</th>
            <th className="px-3 py-2">Test</th>
            <th className="px-3 py-2 text-right">Statistic</th>
            <th className="px-3 py-2 text-right">p-value</th>
            <th className="px-3 py-2 text-right">Effect</th>
            <th className="px-3 py-2 text-right">n</th>
            <th className="px-3 py-2">Caveats</th>
          </tr>
        </thead>
        <tbody className="text-[var(--atlas-text)]">
          {tests.map((t) => (
            <tr
              key={t.id}
              className={`border-t border-[var(--atlas-border)] ${t.significant ? "bg-[var(--atlas-accent-soft)]/30" : ""}`}
            >
              <td className="px-3 py-2 font-medium">{t.vars.join(" × ")}</td>
              <td className="px-3 py-2">
                <AtlasChip
                  severity={t.significant ? "accent" : "neutral"}
                  size="sm"
                >
                  {t.kind}
                </AtlasChip>
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {t.statistic.toFixed(3)}
              </td>
              <td
                className={`px-3 py-2 text-right font-mono tabular-nums ${t.pValue < 0.05 ? "text-[var(--atlas-success-fg)]" : "text-[var(--atlas-text-muted)]"}`}
              >
                {t.pValue < 0.001 ? "<0.001" : t.pValue.toFixed(3)}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {t.effectSize !== undefined
                  ? `${t.effectSize.toFixed(2)}`
                  : "—"}
                {t.effectSizeName && (
                  <span className="text-[10px] text-[var(--atlas-text-subtle)] ml-1">
                    {t.effectSizeName.split(" ")[0]}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-[var(--atlas-text-subtle)]">
                {t.n}
              </td>
              <td className="px-3 py-2 text-[10px] text-[var(--atlas-text-subtle)]">
                {t.caveats.join("; ") || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
