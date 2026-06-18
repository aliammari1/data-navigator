"use client";

import { AlertTriangle, Receipt, TrendingUp } from "lucide-react";
import type { WidgetTelecomData } from "@/features/desktop/components/widgets/use-widget-telecom-data";
import { fmtCompact, fmtPct } from "@/features/telecom/lib/format";

/**
 * KPI widget — surfaces the report's headline numbers (success rate, total
 * transactions, top error) pulled live from `useTelecomAnalytics`.
 *
 * `config.metric` selects which KPI to show; defaults to "successRate".
 */
export type KpiMetric = "successRate" | "totalTx" | "topError";

interface KpiWidgetProps {
  data: WidgetTelecomData;
  config: Record<string, unknown>;
}

export function KpiWidget({ data, config }: KpiWidgetProps) {
  const metric = (config.metric as KpiMetric) ?? "successRate";
  const kpi = data.kpi;

  const value = (() => {
    if (!kpi) return "—";
    if (metric === "successRate") return fmtPct(kpi.successRate);
    if (metric === "totalTx") return fmtCompact(kpi.totalTransactions);
    return kpi.topErrorCode || "—";
  })();

  const label =
    metric === "successRate"
      ? "Taux de réussite"
      : metric === "totalTx"
        ? "Transactions"
        : "Erreur dominante";

  const Icon =
    metric === "successRate" ? TrendingUp : metric === "totalTx" ? Receipt : AlertTriangle;

  const accent = metric === "topError" ? "var(--glass-text-dim)" : "hsl(var(--glass-accent))";

  return (
    <div className="flex h-full flex-col justify-between gap-2 p-1">
      <div className="flex items-center gap-1.5">
        <Icon className="size-3.5" style={{ color: accent }} />
        <span
          className="text-[10px] font-medium uppercase tracking-wide"
          style={{ color: "var(--glass-text-dim)" }}
        >
          {label}
        </span>
      </div>
      <div
        className="truncate font-semibold tabular-nums"
        style={{
          color: "var(--glass-text)",
          fontSize: metric === "topError" ? "20px" : "30px",
          lineHeight: 1,
        }}
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </div>
      <div className="truncate text-[10px]" style={{ color: "var(--glass-text-dim)" }}>
        {data.fileName || "Aucun rapport"}
      </div>
    </div>
  );
}
