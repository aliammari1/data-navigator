"use client";

import { Coins } from "lucide-react";
import type { WidgetTelecomData } from "@/features/desktop/components/widgets/use-widget-telecom-data";
import { fmtAmount } from "@/features/telecom/lib/format";

interface AmountWidgetProps {
  data: WidgetTelecomData;
  config: Record<string, unknown>;
}

export function AmountWidget({ data }: AmountWidgetProps) {
  const kpi = data.kpi;
  const value = kpi ? fmtAmount(kpi.totalAmount) : "—";

  return (
    <div className="flex h-full flex-col justify-between gap-2 p-1">
      <div className="flex items-center gap-1.5">
        <Coins className="size-3.5" style={{ color: "hsl(var(--glass-accent))" }} />
        <span
          className="text-[10px] font-medium uppercase tracking-wide"
          style={{ color: "var(--glass-text-dim)" }}
        >
          Montant total
        </span>
      </div>
      <div
        className="truncate font-semibold tabular-nums"
        style={{ color: "var(--glass-text)", fontSize: "26px", lineHeight: 1 }}
      >
        {value}
      </div>
      <div className="text-[10px]" style={{ color: "var(--glass-text-dim)" }}>
        {kpi ? "TND" : data.fileName || "Aucun rapport"}
      </div>
    </div>
  );
}
