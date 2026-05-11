"use client";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import { motion } from "motion/react";
import { fmtN, fmtPct } from "@/features/telecom/lib/format";
import type * as Types from "@/features/telecom/types";
import { cn } from "@/shared/utils";

export function AlertBanner({
  kpi,
  canals,
}: {
  kpi: Types.KPISummary;
  canals: Types.CanalSummary[];
}) {
  const alerts: Array<{ level: "critical" | "warning" | "info"; msg: string }> =
    [];

  if (kpi.successRate < 80)
    alerts.push({
      level: "critical",
      msg: `Critique : le taux de réussite global est de ${fmtPct(kpi.successRate)} — attention immédiate requise`,
    });
  else if (kpi.successRate < 90)
    alerts.push({
      level: "warning",
      msg: `Taux de réussite inférieur à l'objectif de 90% : ${fmtPct(kpi.successRate)}`,
    });

  if (kpi.declinedCount > kpi.totalTransactions * 0.15)
    alerts.push({
      level: "critical",
      msg: `Volume d'échecs élevé : ${fmtN(kpi.declinedCount)} transactions refusées (${fmtPct((kpi.declinedCount / kpi.totalTransactions) * 100)})`,
    });

  for (const c of canals) {
    if (c.successRate < 70 && c.total > 50)
      alerts.push({
        level: "critical",
        msg: `${c.label} : taux de réussite critique ${fmtPct(c.successRate)}`,
      });
    else if (c.successRate < 85 && c.total > 50)
      alerts.push({
        level: "warning",
        msg: `${c.label} : taux de réussite ${fmtPct(c.successRate)} est inférieur à 85%`,
      });
  }

  if (
    kpi.topErrorCode &&
    kpi.topErrorCode !== "N/A" &&
    kpi.topErrorCode !== "null"
  )
    alerts.push({
      level: "info",
      msg: `Code d'erreur le plus fréquent : ${kpi.topErrorCode}`,
    });

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {alerts.slice(0, 5).map((a, idx) => (
        <motion.div
          key={a.msg}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{
            delay: idx * 0.07,
            type: "spring",
            stiffness: 350,
            damping: 28,
          }}
          className={cn(
            "flex items-center gap-3 px-4 py-2.5 rounded-xl border text-xs font-medium",
            a.level === "critical"
              ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-500/10 dark:border-red-500/25 dark:text-red-300"
              : a.level === "warning"
                ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/25 dark:text-amber-300"
                : "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-500/10 dark:border-blue-500/25 dark:text-blue-300",
          )}
        >
          {a.level === "critical" ? (
            <AlertTriangle className="w-4 h-4 flex-none" />
          ) : a.level === "warning" ? (
            <AlertCircle className="w-4 h-4 flex-none" />
          ) : (
            <Info className="w-4 h-4 flex-none" />
          )}
          {a.msg}
        </motion.div>
      ))}
    </div>
  );
}
