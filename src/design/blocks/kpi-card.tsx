"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import type { AtlasSeverity } from "../tokens";

interface KPIProps {
  label: string;
  value: string | number;
  delta?: number; // percent change vs previous
  hint?: string;
  icon?: ReactNode;
  severity?: AtlasSeverity;
}

const sevBorder: Record<AtlasSeverity, string> = {
  info: "border-(--atlas-info-border)",
  success: "border-(--atlas-success-border)",
  warning: "border-(--atlas-warning-border)",
  danger: "border-(--atlas-danger-border)",
  accent: "border-(--atlas-accent-border)",
};

const sevSoft: Record<AtlasSeverity, string> = {
  info: "bg-(--atlas-info-soft)",
  success: "bg-(--atlas-success-soft)",
  warning: "bg-(--atlas-warning-soft)",
  danger: "bg-(--atlas-danger-soft)",
  accent: "bg-(--atlas-accent-soft)",
};

export function AtlasKPI({
  label,
  value,
  delta,
  hint,
  icon,
  severity = "accent",
}: KPIProps) {
  const trendIcon =
    delta === undefined ? null : delta > 0 ? (
      <ArrowUpRight className="w-3.5 h-3.5" />
    ) : delta < 0 ? (
      <ArrowDownRight className="w-3.5 h-3.5" />
    ) : (
      <ArrowRight className="w-3.5 h-3.5" />
    );
  const trendTone =
    delta === undefined
      ? ""
      : delta > 0
        ? "text-(--atlas-success-fg)"
        : delta < 0
          ? "text-(--atlas-danger-fg)"
          : "text-(--atlas-text-muted)";

  return (
    <div
      className={`rounded-(--atlas-radius-3) border ${sevBorder[severity]} bg-(--atlas-surface) p-3.5 transition-colors hover:bg-(--atlas-surface-raised)`}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[10px] uppercase tracking-wide text-(--atlas-text-subtle) font-bold">
          {label}
        </span>
        {icon && (
          <div
            className={`flex-none w-6 h-6 rounded-full ${sevSoft[severity]} ${sevBorder[severity]} border flex items-center justify-center [&>svg]:w-3 [&>svg]:h-3`}
          >
            {icon}
          </div>
        )}
      </div>
      <div className="text-(--atlas-text) text-xl font-bold tabular-nums leading-none">
        {value}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        {delta !== undefined && (
          <div
            className={`flex items-center gap-1 text-[11px] font-semibold ${trendTone}`}
          >
            {trendIcon}
            <span>{Math.abs(delta).toFixed(1)}%</span>
          </div>
        )}
        {hint && (
          <span className="text-[11px] text-(--atlas-text-subtle) truncate">
            {hint}
          </span>
        )}
      </div>
    </div>
  );
}
