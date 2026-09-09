"use client";

import { useMemo } from "react";
import type { WidgetTelecomData } from "@/features/desktop/components/widgets/use-widget-telecom-data";
import { fmtCompact } from "@/features/telecom/lib/format";
import { REVENUE_GROUPS } from "@/features/telecom/lib/revenue-groups";

/**
 * Revenue-per-group widget — the desktop-tile counterpart of the Overview
 * "Revenue per Group" chart: the top revenue groups (canals folded into the
 * REVENUE_GROUPS buckets) by successful amount, as compact coloured bars.
 */
interface RevenueGroupWidgetProps {
  data: WidgetTelecomData;
  config: Record<string, unknown>;
}

export function RevenueGroupWidget({ data }: RevenueGroupWidgetProps) {
  const groups = useMemo(() => {
    return Object.entries(REVENUE_GROUPS)
      .map(([name, { keys, color }]) => {
        const amount = data.canals
          .filter((c) => keys.includes(c.key))
          .reduce((s, c) => s + c.amount, 0);
        return { name, color, amount };
      })
      .filter((g) => g.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 4);
  }, [data.canals]);

  const max = useMemo(() => Math.max(1, ...groups.map((g) => g.amount)), [groups]);

  return (
    <div className="flex h-full flex-col gap-1.5 p-1">
      <span
        className="text-[10px] font-medium uppercase tracking-wide"
        style={{ color: "var(--glass-text-dim)" }}
      >
        Revenu / groupe
      </span>
      {groups.length === 0 ? (
        <span className="text-[11px]" style={{ color: "var(--glass-text-dim)" }}>
          Aucune donnée
        </span>
      ) : (
        <div className="flex flex-1 flex-col justify-center gap-1.5">
          {groups.map((g) => (
            <div key={g.name} className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between gap-2">
                <span
                  className="truncate text-[10px] font-medium"
                  style={{ color: "var(--glass-text)" }}
                  title={g.name}
                >
                  {g.name}
                </span>
                <span
                  className="shrink-0 text-[10px] tabular-nums"
                  style={{ color: "var(--glass-text-dim)" }}
                >
                  {fmtCompact(g.amount)}
                </span>
              </div>
              <div
                className="h-1.5 overflow-hidden rounded-full"
                style={{ background: "var(--glass-hairline)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.max(4, (g.amount / max) * 100)}%`, background: g.color }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
