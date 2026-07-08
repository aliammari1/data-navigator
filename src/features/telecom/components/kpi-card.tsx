"use client";
import { ArrowDownRight, ArrowUpRight, Pin } from "lucide-react";
import { motion } from "motion/react";
import { memo } from "react";
import type * as Types from "@/features/telecom/types";
import { cn } from "@/shared/utils";

export interface KPICardProps {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  color: string;
  delay?: number;
  size?: "xs" | "sm" | "md" | "lg";
  kpiKey?: keyof Types.KPISummary;
  selected?: boolean;
  onToggle?: () => void;
  /** Whether this KPI is currently pinned to the desktop as a widget. */
  pinned?: boolean;
  /** Toggle pin/unpin this KPI to the desktop. When omitted, no pin button. */
  onPin?: () => void;
}

export const KPICard = memo(function KPICard({
  label,
  value,
  sub,
  icon,
  trend,
  trendValue,
  color,
  delay = 0,
  size = "md",
  kpiKey,
  selected,
  onToggle,
  pinned,
  onPin,
}: KPICardProps) {
  const isHero = size === "lg";
  const fs =
    size === "lg"
      ? "text-4xl tracking-tight"
      : size === "md"
        ? "text-2xl"
        : size === "sm"
          ? "text-xl"
          : "text-base";
  const ls = size === "xs" || size === "sm" ? "text-[10px]" : "text-xs";
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2, scale: 1.015 }}
      whileTap={{ scale: 0.97 }}
      transition={{
        delay,
        duration: 0.35,
        type: "spring",
        stiffness: 350,
        damping: 22,
      }}
      className={cn(
        "group rounded-2xl border flex flex-col gap-3 overflow-hidden relative",
        isHero ? "p-5" : "p-4",
        color,
        kpiKey && selected && "ring-2 ring-primary/60",
      )}
    >
      {kpiKey && (
        <button
          type="button"
          aria-label={selected ? "Désélectionner pour l'export" : "Sélectionner pour l'export"}
          onClick={onToggle}
          className={cn(
            "absolute top-2 left-2 w-4 h-4 rounded flex items-center justify-center border transition-all z-10",
            selected
              ? "bg-primary border-primary text-primary-foreground"
              : "bg-background/70 border-border/60 text-transparent hover:border-primary",
          )}
        >
          {selected && (
            <svg
              viewBox="0 0 10 10"
              className="w-2.5 h-2.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <polyline points="1.5,5 4,7.5 8.5,2.5" />
            </svg>
          )}
        </button>
      )}
      <div className="flex items-center justify-between">
        <span
          className={cn("font-semibold text-muted-foreground leading-tight", ls, kpiKey && "pl-5")}
        >
          {label}
        </span>
        <div className="flex items-center gap-1.5 flex-none">
          {onPin && (
            <button
              type="button"
              aria-label={pinned ? "Retirer du bureau" : "Épingler au bureau"}
              title={pinned ? "Retirer du bureau" : "Épingler au bureau"}
              onClick={onPin}
              className={cn(
                "grid place-items-center rounded-lg border transition-all",
                isHero ? "w-7 h-7" : "w-6 h-6",
                pinned
                  ? "border-primary/40 bg-primary/10 text-primary opacity-100"
                  : "border-border/60 bg-background/70 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:border-primary hover:text-primary",
              )}
            >
              <Pin className={cn("size-3.5", pinned && "fill-current")} />
            </button>
          )}
          <div
            className={cn(
              "rounded-xl flex items-center justify-center flex-none",
              "bg-background/70 border border-border/60 shadow-sm",
              isHero ? "w-9 h-9" : "w-7 h-7",
            )}
          >
            {icon}
          </div>
        </div>
      </div>
      <div className={cn("font-black text-foreground tabular-nums leading-none", fs)}>{value}</div>
      {(sub ?? trendValue) && (
        <div className="flex items-center justify-between gap-2 flex-wrap mt-auto">
          {sub && <span className={cn("text-muted-foreground leading-tight", ls)}>{sub}</span>}
          {trendValue && (
            <span
              className={cn(
                "flex items-center gap-0.5 font-semibold rounded-full flex-none",
                isHero ? "text-[11px] px-2 py-0.5" : "text-[10px] px-1.5 py-0.5",
                trend === "up"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                  : trend === "down"
                    ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {trend === "up" ? (
                <ArrowUpRight className="w-3 h-3" />
              ) : trend === "down" ? (
                <ArrowDownRight className="w-3 h-3" />
              ) : null}
              {trendValue}
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
});
