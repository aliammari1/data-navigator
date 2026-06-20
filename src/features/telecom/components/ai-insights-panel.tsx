"use client";
import { AlertCircle, AlertTriangle, Brain, CheckCircle2, Info } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/shared/utils";
import type * as Types from "@/features/telecom/types";

export function AIInsightsPanel({
  insights,
  loading,
}: {
  insights: Types.AIInsight[];
  loading: boolean;
}) {
  const sevCfg = {
    critical: {
      border: "border-red-500/25",
      bg: "bg-red-500/8",
      bar: "bg-red-500",
      icon: <AlertTriangle className="w-4 h-4 text-red-500 dark:text-red-400 flex-none mt-0.5" />,
    },
    warning: {
      border: "border-amber-200 dark:border-amber-500/25",
      bg: "bg-amber-500/8",
      bar: "bg-amber-500",
      icon: <AlertCircle className="w-4 h-4 text-amber-500 dark:text-amber-400 flex-none mt-0.5" />,
    },
    info: {
      border: "border-blue-200 dark:border-blue-500/25",
      bg: "bg-blue-500/8",
      bar: "bg-blue-500",
      icon: <Info className="w-4 h-4 text-blue-500 dark:text-blue-400 flex-none mt-0.5" />,
    },
    positive: {
      border: "border-emerald-200 dark:border-emerald-500/25",
      bg: "bg-emerald-500/8",
      bar: "bg-emerald-500",
      icon: (
        <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400 flex-none mt-0.5" />
      ),
    },
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={`insight-skeleton-${i}`}
            className="rounded-xl border border-border bg-muted/40 p-4 animate-pulse space-y-2"
          >
            <div className="h-3 bg-accent rounded w-3/4" />
            <div className="h-2.5 bg-muted rounded w-full" />
            <div className="h-2.5 bg-muted rounded w-5/6" />
          </div>
        ))}
      </div>
    );
  }

  if (insights.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
        <Brain className="w-10 h-10 opacity-30" />
        <div className="text-sm">
          Aucune anomalie détectée — toutes les métriques sont dans la plage normale.
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {insights.map((ins, idx) => {
        const cfg = sevCfg[ins.severity];
        return (
          <motion.div
            key={ins.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className={cn("rounded-xl border overflow-hidden flex", cfg.border, cfg.bg)}
          >
            <div className={cn("w-1 flex-none", cfg.bar)} />
            <div className="flex-1 p-4 space-y-2">
              <div className="flex items-start gap-2">
                {cfg.icon}
                <span className="text-xs font-bold text-foreground leading-tight">{ins.title}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed pl-6">{ins.body}</p>
              {ins.metric && (
                <div className="pl-6">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent border border-border text-muted-foreground font-mono font-semibold">
                    {ins.metric}
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
