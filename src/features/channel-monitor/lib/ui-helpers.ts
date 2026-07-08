/**
 * Pure presentational helpers (colors, labels, severity weights). Extracted
 * from the former 1652-line screen so the tab components stay thin.
 */

import type {
  AlertCondition,
  AlertMetric,
  AlertSeverity,
  ChannelHealth,
  ChannelStatus,
} from "../store/monitor-store";

export function healthColor(h: ChannelHealth): string {
  return {
    healthy: "bg-emerald-500",
    degraded: "bg-amber-500",
    critical: "bg-red-500",
    unknown: "bg-slate-500",
  }[h];
}

export function healthTextColor(h: ChannelHealth): string {
  return {
    healthy: "text-emerald-400",
    degraded: "text-amber-400",
    critical: "text-red-400",
    unknown: "text-slate-400",
  }[h];
}

export function severityBadgeClass(s: AlertSeverity): string {
  return {
    info: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    warning: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    critical: "bg-red-500/20 text-red-300 border-red-500/30",
  }[s];
}

export function severityDot(s: AlertSeverity): string {
  return {
    info: "bg-blue-400",
    warning: "bg-amber-400",
    critical: "bg-red-400",
  }[s];
}

/** Numeric weight used for scatter Y-position + sorting. */
export function severityWeight(s: AlertSeverity): number {
  return s === "critical" ? 3 : s === "warning" ? 2 : 1;
}

export function metricLabel(m: AlertMetric): string {
  return {
    success_rate: "Success Rate",
    volume: "Volume",
    failure_count: "Failure Count",
    avg_amount: "Avg Amount",
  }[m];
}

export function conditionLabel(c: AlertCondition): string {
  return {
    falls_below: "Falls below",
    exceeds: "Exceeds",
    equals: "Equals",
  }[c];
}

export function successRateColor(rate: number): string {
  return rate > 95 ? "text-emerald-400" : rate >= 85 ? "text-amber-400" : "text-red-400";
}

export function trendSymbol(trend: ChannelStatus["trend"]): {
  glyph: string;
  className: string;
} {
  if (trend === "up") return { glyph: "↑", className: "text-emerald-400 font-bold" };
  if (trend === "down") return { glyph: "↓", className: "text-red-400 font-bold" };
  return { glyph: "→", className: "text-slate-400" };
}
