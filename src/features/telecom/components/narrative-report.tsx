"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Brain, CheckCircle2, Download } from "lucide-react";
import type * as Types from "@/features/telecom/types";
import { generateNarrative } from "@/features/telecom/lib/insights";

export function NarrativeReport({
  kpi,
  canals,
  hourly,
  reportDate,
}: {
  kpi: Types.KPISummary;
  canals: Types.CanalSummary[];
  hourly: Types.HourlyRow[];
  reportDate: string;
}) {
  const narrative = useMemo(
    () => generateNarrative(kpi, canals, hourly, reportDate),
    [kpi, canals, hourly, reportDate],
  );
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard
      .writeText(narrative)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Brain className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
          <span>
            "Résumé exécutif généré automatiquement · "mis à jour avec les
            données
          </span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground bg-muted hover:bg-accent border border-border rounded-lg transition-colors"
        >
          {copied ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
          ) : (
            <Download className="w-3 h-3" />
          )}
          {copied ? "Copié" : "Copier"}
        </button>
      </div>
      <motion.div className="rounded-xl bg-background/80 border border-border p-5">
        <p className="text-sm text-muted-foreground leading-7 font-light">
          {narrative}
        </p>
      </motion.div>
    </div>
  );
}
