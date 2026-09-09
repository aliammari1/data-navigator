"use client";

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  type LucideIcon,
  Receipt,
  RefreshCw,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";
import type { WidgetTelecomData } from "@/features/desktop/components/widgets/use-widget-telecom-data";
import { fmtAmount, fmtCompact, fmtDuration, fmtPct } from "@/features/telecom/lib/format";
import type { KPISummary } from "@/features/telecom/types";

/**
 * KPI widget — surfaces one of the report's headline numbers pulled live from
 * `useTelecomAnalytics`. `config.metric` selects which KPI to show; it defaults
 * to "successRate" and falls back to it for any unknown value.
 *
 * The metric set mirrors the telecom Overview KPI cards so any of them can be
 * pinned to the desktop (`successRate` / `totalTx` / `topError` are kept as the
 * original ids for backward compatibility with already-pinned widgets).
 */
export type KpiMetric =
  | "successRate"
  | "totalTx"
  | "topError"
  | "totalTransactions"
  | "successCount"
  | "declinedCount"
  | "instanceCount"
  | "refundCount"
  | "submittedCount"
  | "uniqueCustomers"
  | "avgProcessingMs"
  | "totalAmount";

interface MetricDef {
  label: string;
  icon: LucideIcon;
  value: (kpi: KPISummary) => string;
  /** Render as text (smaller, dim accent) rather than a big number. */
  text?: boolean;
}

const METRICS: Record<KpiMetric, MetricDef> = {
  successRate: { label: "Taux de réussite", icon: TrendingUp, value: (k) => fmtPct(k.successRate) },
  totalTx: { label: "Transactions", icon: Receipt, value: (k) => fmtCompact(k.totalTransactions) },
  totalTransactions: {
    label: "Transactions totales",
    icon: Receipt,
    value: (k) => fmtCompact(k.totalTransactions),
  },
  topError: {
    label: "Erreur dominante",
    icon: AlertTriangle,
    value: (k) => k.topErrorCode || "—",
    text: true,
  },
  successCount: { label: "Réussies", icon: CheckCircle2, value: (k) => fmtCompact(k.successCount) },
  declinedCount: {
    label: "Échec (refusé)",
    icon: XCircle,
    value: (k) => fmtCompact(k.declinedCount),
  },
  instanceCount: { label: "Instance", icon: Clock, value: (k) => fmtCompact(k.instanceCount) },
  refundCount: { label: "Annulation", icon: RefreshCw, value: (k) => fmtCompact(k.refundCount) },
  submittedCount: {
    label: "Confirmé",
    icon: CheckCircle2,
    value: (k) => fmtCompact(k.submittedCount),
  },
  uniqueCustomers: {
    label: "Abonnés uniques",
    icon: Activity,
    value: (k) => fmtCompact(k.uniqueCustomers),
  },
  avgProcessingMs: {
    label: "Traitement moy.",
    icon: Zap,
    value: (k) => fmtDuration(k.avgProcessingMs),
  },
  totalAmount: { label: "Montant", icon: Receipt, value: (k) => fmtAmount(k.totalAmount) },
};

/** Ordered metric choices, for the widget config menu and KPI pin targets. */
export const KPI_METRICS: { id: KpiMetric; label: string }[] = (
  Object.keys(METRICS) as KpiMetric[]
).map((id) => ({ id, label: METRICS[id].label }));

interface KpiWidgetProps {
  data: WidgetTelecomData;
  config: Record<string, unknown>;
}

export function KpiWidget({ data, config }: KpiWidgetProps) {
  const raw = typeof config.metric === "string" ? config.metric : "successRate";
  const metric: KpiMetric = raw in METRICS ? (raw as KpiMetric) : "successRate";
  const def = METRICS[metric];
  const kpi = data.kpi;
  const value = kpi ? def.value(kpi) : "—";
  const Icon = def.icon;
  const accent = def.text ? "var(--glass-text-dim)" : "hsl(var(--glass-accent))";

  return (
    <div className="flex h-full flex-col justify-between gap-2 p-1">
      <div className="flex items-center gap-1.5">
        <Icon className="size-3.5" style={{ color: accent }} />
        <span
          className="text-[10px] font-medium uppercase tracking-wide"
          style={{ color: "var(--glass-text-dim)" }}
        >
          {def.label}
        </span>
      </div>
      <div
        className="truncate font-semibold tabular-nums"
        style={{
          color: "var(--glass-text)",
          fontSize: def.text ? "20px" : "30px",
          lineHeight: 1,
        }}
        title={value}
      >
        {value}
      </div>
      <div className="truncate text-[10px]" style={{ color: "var(--glass-text-dim)" }}>
        {data.fileName || "Aucun rapport"}
      </div>
    </div>
  );
}
