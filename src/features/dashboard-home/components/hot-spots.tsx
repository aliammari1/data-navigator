"use client";

import { AlertTriangle, ArrowRight, TrendingDown } from "lucide-react";
import { useMemo } from "react";
import { handleLauncherClick } from "@/features/dashboard-home/lib/open-app";
import { EChart } from "@/features/telecom/components/echart";
import { chartTheme } from "@/features/telecom/lib/chart-options";
import { fmtN, fmtPct } from "@/features/telecom/lib/format";
import type * as Types from "@/features/telecom/types";
import type { EChartsOption } from "@/platform/viz";
import { cn } from "@/shared/utils";

/**
 * Points chauds — the two facts an ops analyst actually needs on landing:
 * which channel is failing, and how today's outcomes break down. Both panels
 * carry a real embedded chart built from data the page already has loaded
 * (no extra queries), and link straight to where you'd act on it.
 */
export function HotSpots({
  canals,
  kpi,
  loading,
}: {
  canals: Types.CanalSummary[];
  kpi: Types.KPISummary | null;
  loading: boolean;
}) {
  const weakest =
    canals.length > 0
      ? canals.reduce((worst, canal) => (canal.successRate < worst.successRate ? canal : worst))
      : null;
  const weakestIsSevere = !loading && !!weakest && weakest.successRate < 85;

  return (
    <div className="grid h-full gap-3 sm:grid-cols-2">
      <HotSpotPanel
        icon={<TrendingDown className="size-4" aria-hidden="true" />}
        label="Canal le plus fragile"
        value={loading || !weakest ? "—" : weakest.label}
        detail={
          loading || !weakest
            ? "Analyse des transactions en cours…"
            : `${fmtPct(weakest.successRate)} de réussite · ${fmtN(weakest.declined)} échecs`
        }
        href="/dashboard/telecom-report/canals"
        severe={weakestIsSevere}
      >
        {!loading && canals.length > 1 ? (
          <CanalCompareChart canals={canals} weakestKey={weakest?.key} />
        ) : null}
      </HotSpotPanel>

      <HotSpotPanel
        icon={<AlertTriangle className="size-4" aria-hidden="true" />}
        label="Erreur la plus fréquente"
        value={loading ? "—" : kpi?.topErrorCode || "Aucune"}
        detail={
          loading
            ? "Analyse des transactions en cours…"
            : kpi?.topErrorCode
              ? "Code d'erreur dominant aujourd'hui"
              : "Aucune erreur dominante aujourd'hui"
        }
        href="/dashboard/telecom-report/analysis"
        severe={false}
      >
        {!loading && kpi ? <StatusBreakdownBar kpi={kpi} /> : null}
      </HotSpotPanel>
    </div>
  );
}

function HotSpotPanel({
  icon,
  label,
  value,
  detail,
  href,
  severe,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  href: string;
  severe: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div>
        <div
          className={cn(
            "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide",
            severe ? "text-negative" : "text-muted-foreground",
          )}
        >
          {icon}
          {label}
        </div>
        <p className="mt-1.5 truncate text-lg font-semibold text-foreground">{value}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{detail}</p>
      </div>

      {children}

      <a
        href={href}
        onClick={handleLauncherClick("telecom", href)}
        className="group mt-auto inline-flex w-fit items-center gap-1 rounded text-sm font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Voir le détail
        <ArrowRight
          aria-hidden="true"
          className="size-3.5 transition-transform group-hover:translate-x-0.5"
        />
      </a>
    </div>
  );
}

function CanalCompareChart({
  canals,
  weakestKey,
}: {
  canals: Types.CanalSummary[];
  weakestKey?: string;
}) {
  const option = useMemo<EChartsOption>(() => {
    const theme = chartTheme();
    const sorted = [...canals].sort((a, b) => b.successRate - a.successRate);
    return {
      grid: { left: 0, right: 8, top: 4, bottom: 20, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: theme.tooltipBg,
        borderColor: theme.tooltipBorder,
        textStyle: { color: theme.tooltipText },
        formatter: (params: unknown) => {
          const arr = params as Array<{ axisValue: string; value: number }>;
          const p = arr[0];
          if (!p) return "";
          return `${p.axisValue} · ${Number(p.value).toFixed(1)}%`;
        },
      },
      xAxis: {
        type: "category",
        data: sorted.map((c) => c.label),
        axisLine: { lineStyle: { color: theme.splitLine } },
        axisTick: { show: false },
        axisLabel: { color: theme.axisDim, fontSize: 11 },
      },
      yAxis: { type: "value", show: false },
      series: [
        {
          type: "bar",
          data: sorted.map((c) => ({
            value: c.successRate,
            itemStyle: {
              color: c.key === weakestKey ? theme.warning : theme.primary,
              borderRadius: [4, 4, 0, 0],
            },
          })),
          barMaxWidth: 32,
        },
      ],
    };
  }, [canals, weakestKey]);

  return <EChart option={option} height={110} />;
}

function StatusBreakdownBar({ kpi }: { kpi: Types.KPISummary }) {
  const total = kpi.totalTransactions || 1;
  const segments = [
    { label: "Réussies", count: kpi.successCount, className: "bg-positive" },
    { label: "Échecs", count: kpi.declinedCount, className: "bg-negative" },
    { label: "Remboursements", count: kpi.refundCount, className: "bg-warning" },
    { label: "En attente", count: kpi.instanceCount, className: "bg-muted-foreground/50" },
  ].filter((segment) => segment.count > 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {segments.map((segment) => (
          <div
            key={segment.label}
            className={cn("h-full", segment.className)}
            style={{ width: `${(segment.count / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {segments.map((segment) => (
          <span key={segment.label} className="flex items-center gap-1">
            <span className={cn("size-1.5 rounded-full", segment.className)} />
            {segment.label} · {fmtPct((segment.count / total) * 100)}
          </span>
        ))}
      </div>
    </div>
  );
}
