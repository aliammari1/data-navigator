"use client";

import { useMemo } from "react";
import type { WidgetTelecomData } from "@/features/desktop/components/widgets/use-widget-telecom-data";
import { fmtPct } from "@/features/telecom/lib/format";

/**
 * Success-rate-by-group widget — the desktop-tile counterpart of the Overview
 * "Taux de Réussite par Groupe" chart: the busiest channels with their success
 * rate as a bar coloured green / amber / red by health.
 */
interface SuccessRateWidgetProps {
  data: WidgetTelecomData;
  config: Record<string, unknown>;
}

function rateColor(rate: number): string {
  if (rate >= 90) return "#22c55e";
  if (rate >= 70) return "#f59e0b";
  return "#ef4444";
}

export function SuccessRateWidget({ data, config }: SuccessRateWidgetProps) {
  const rows = useMemo(() => {
    const limit = typeof config.limit === "number" ? config.limit : 4;
    return [...data.canals]
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
  }, [data.canals, config.limit]);

  return (
    <div className="flex h-full flex-col gap-1.5 p-1">
      <span
        className="text-[10px] font-medium uppercase tracking-wide"
        style={{ color: "var(--glass-text-dim)" }}
      >
        Taux par groupe
      </span>
      {rows.length === 0 ? (
        <span className="text-[11px]" style={{ color: "var(--glass-text-dim)" }}>
          Aucune donnée
        </span>
      ) : (
        <div className="flex flex-1 flex-col justify-center gap-1.5">
          {rows.map((c) => (
            <div key={c.key} className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between gap-2">
                <span
                  className="truncate text-[10px] font-medium"
                  style={{ color: "var(--glass-text)" }}
                  title={c.label}
                >
                  {c.label}
                </span>
                <span
                  className="shrink-0 text-[10px] tabular-nums font-medium"
                  style={{ color: rateColor(c.successRate) }}
                >
                  {fmtPct(c.successRate)}
                </span>
              </div>
              <div
                className="h-1.5 overflow-hidden rounded-full"
                style={{ background: "var(--glass-hairline)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(4, Math.min(100, c.successRate))}%`,
                    background: rateColor(c.successRate),
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
