"use client";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { motion } from "motion/react";
import { memo } from "react";
import type * as Types from "@/features/telecom/types";
import { cn } from "@/shared/utils";

interface KPICardProps {
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
        "rounded-2xl border flex flex-col gap-3 overflow-hidden relative",
        isHero ? "p-5" : "p-4",
        color,
        kpiKey &&
          selected &&
          "ring-2 ring-indigo-400/60 dark:ring-indigo-400/50",
      )}
    >
      {kpiKey && (
        <button
          type="button"
          aria-label={
            selected
              ? "Désélectionner pour l'export"
              : "Sélectionner pour l'export"
          }
          onClick={onToggle}
          className={cn(
            "absolute top-2 left-2 w-4 h-4 rounded flex items-center justify-center border transition-all z-10",
            selected
              ? "bg-indigo-500 border-indigo-500 text-white"
              : "bg-background/70 border-border/60 text-transparent hover:border-indigo-400",
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
          className={cn(
            "font-semibold text-muted-foreground leading-tight",
            ls,
            kpiKey && "pl-5",
          )}
        >
          {label}
        </span>
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
      <div
        className={cn(
          "font-black text-foreground tabular-nums leading-none",
          fs,
        )}
      >
        {value}
      </div>
      {(sub ?? trendValue) && (
        <div className="flex items-center justify-between gap-2 flex-wrap mt-auto">
          {sub && (
            <span className={cn("text-muted-foreground leading-tight", ls)}>
              {sub}
            </span>
          )}
          {trendValue && (
            <span
              className={cn(
                "flex items-center gap-0.5 font-semibold rounded-full flex-none",
                isHero
                  ? "text-[11px] px-2 py-0.5"
                  : "text-[10px] px-1.5 py-0.5",
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
