"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { NumberTicker } from "@/components/ui/number-ticker";
import { cn } from "@/shared/utils";

type Trend = "up" | "down" | "neutral";

/**
 * KpiStat — the shared metric primitive. Fully tokenized: deltas use
 * `--positive`/`--negative` (the hardcoded emerald/red/indigo of the old
 * telecom KPICard are gone), values render in tabular Fira Code, and an
 * optional count-up runs once via NumberTicker. Selection state uses `--ring`.
 */
export function KpiStat({
  label,
  value,
  /** Numeric value enabling the count-up; when set, `value` is ignored. */
  numericValue,
  decimalPlaces = 0,
  prefix,
  suffix,
  icon,
  trend = "neutral",
  trendValue,
  sub,
  selected,
  onToggle,
  selectLabel,
  className,
}: {
  label: ReactNode;
  value?: ReactNode;
  numericValue?: number;
  decimalPlaces?: number;
  prefix?: string;
  suffix?: string;
  icon?: ReactNode;
  trend?: Trend;
  trendValue?: ReactNode;
  sub?: ReactNode;
  selected?: boolean;
  onToggle?: () => void;
  selectLabel?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        " group relative flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors",
        selected && "ring-2 ring-ring",
        className,
      )}
    >
      {onToggle ? (
        <button
          type="button"
          aria-pressed={selected}
          aria-label={selectLabel ?? "Sélectionner"}
          onClick={onToggle}
          className={cn(
            "absolute left-2 top-2 z-10 flex size-4 items-center justify-center rounded border transition-colors",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border/60 bg-background/70 text-transparent hover:border-primary",
          )}
        >
          <svg
            viewBox="0 0 10 10"
            className="size-2.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <polyline points="1.5,5 4,7.5 8.5,2.5" />
          </svg>
        </button>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground",
            onToggle && "pl-5",
          )}
        >
          {label}
        </span>
        {icon ? (
          <span className="flex size-7 flex-none items-center justify-center rounded-lg border border-border bg-background/70 text-muted-foreground [&_svg]:size-4">
            {icon}
          </span>
        ) : null}
      </div>

      <div className="font-mono text-2xl font-semibold leading-none tabular-nums text-foreground">
        {numericValue !== undefined ? (
          <>
            {prefix}
            <NumberTicker
              value={numericValue}
              decimalPlaces={decimalPlaces}
              className="text-foreground"
            />
            {suffix}
          </>
        ) : (
          value
        )}
      </div>

      {sub || trendValue ? (
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
          {sub ? <span className="text-xs leading-tight text-muted-foreground">{sub}</span> : null}
          {trendValue ? (
            <span
              className={cn(
                "flex flex-none items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
                trend === "up" &&
                  "bg-[color-mix(in_oklab,var(--positive)_15%,transparent)] text-positive",
                trend === "down" &&
                  "bg-[color-mix(in_oklab,var(--negative)_15%,transparent)] text-negative",
                trend === "neutral" && "bg-muted text-muted-foreground",
              )}
            >
              {trend === "up" ? (
                <ArrowUpRight className="size-3" />
              ) : trend === "down" ? (
                <ArrowDownRight className="size-3" />
              ) : (
                <ArrowRight className="size-3" />
              )}
              {trendValue}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
