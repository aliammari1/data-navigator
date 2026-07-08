"use client";

import { useMemo } from "react";
import type { WidgetTelecomData } from "@/features/desktop/components/widgets/use-widget-telecom-data";
import { fmtN, fmtPct } from "@/features/telecom/lib/format";

interface MiniReportWidgetProps {
  data: WidgetTelecomData;
  config: Record<string, unknown>;
}

export function MiniReportWidget({ data }: MiniReportWidgetProps) {
  const kpi = data.kpi;
  const topCanals = useMemo(() => data.canals.slice(0, 3), [data.canals]);

  if (!kpi) {
    return (
      <div className="flex h-full items-center justify-center p-1">
        <span className="text-[10px]" style={{ color: "var(--glass-text-dim)" }}>
          Chargement…
        </span>
      </div>
    );
  }

  const rateColor =
    kpi.successRate >= 90 ? "#22c55e" : kpi.successRate >= 70 ? "#f59e0b" : "#ef4444";

  return (
    <div className="flex h-full flex-col gap-1.5 p-1">
      {/* Header: rate + peak */}
      <div className="flex items-baseline justify-between">
        <span
          className="text-xl font-bold tabular-nums"
          style={{ color: rateColor, lineHeight: 1 }}
        >
          {fmtPct(kpi.successRate)}
        </span>
        <span className="text-[9px]" style={{ color: "var(--glass-text-dim)" }}>
          Pic {String(kpi.peakHour).padStart(2, "0")}h
        </span>
      </div>
      <div className="text-[9px]" style={{ color: "var(--glass-text-dim)" }}>
        {fmtN(kpi.totalTransactions)} tx
      </div>
      {/* Top canals */}
      <div className="flex flex-1 flex-col justify-end gap-0.5">
        {topCanals.map((c) => (
          <div key={c.key} className="flex items-center gap-1">
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: c.color || "hsl(var(--glass-accent))" }}
            />
            <span className="truncate text-[9px]" style={{ color: "var(--glass-text)" }}>
              {c.label}
            </span>
            <span
              className="ml-auto text-[9px] tabular-nums"
              style={{ color: "var(--glass-text-dim)" }}
            >
              {fmtPct(c.share)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
