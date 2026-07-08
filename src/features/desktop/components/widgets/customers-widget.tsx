"use client";

import { Users } from "lucide-react";
import type { WidgetTelecomData } from "@/features/desktop/components/widgets/use-widget-telecom-data";
import { fmtCompact } from "@/features/telecom/lib/format";

interface CustomersWidgetProps {
  data: WidgetTelecomData;
  config: Record<string, unknown>;
}

export function CustomersWidget({ data }: CustomersWidgetProps) {
  const kpi = data.kpi;
  const value = kpi ? fmtCompact(kpi.uniqueCustomers) : "—";
  const sub = kpi
    ? `Pic à ${String(kpi.peakHour).padStart(2, "0")}:00`
    : data.fileName || "Aucun rapport";

  return (
    <div className="flex h-full flex-col justify-between gap-2 p-1">
      <div className="flex items-center gap-1.5">
        <Users className="size-3.5" style={{ color: "hsl(var(--glass-accent))" }} />
        <span
          className="text-[10px] font-medium uppercase tracking-wide"
          style={{ color: "var(--glass-text-dim)" }}
        >
          Abonnés
        </span>
      </div>
      <div
        className="truncate font-semibold tabular-nums"
        style={{ color: "var(--glass-text)", fontSize: "30px", lineHeight: 1 }}
      >
        {value}
      </div>
      <div className="truncate text-[10px]" style={{ color: "var(--glass-text-dim)" }}>
        {sub}
      </div>
    </div>
  );
}
