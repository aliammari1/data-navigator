"use client";

import { BarChart2, Brain, Layers, Sparkles, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtCompact } from "@/features/telecom/lib/format";
import type * as Types from "@/features/telecom/types";

export function TabBar({
  active,
  onChange,
  counts,
}: {
  active: Types.MainTab;
  onChange: (t: Types.MainTab) => void;
  counts: Record<string, number>;
}) {
  const tabs: Array<{
    key: Types.MainTab;
    label: string;
    icon: React.ElementType;
    activeClass: string;
  }> = [
    {
      key: "overview",
      label: "Vue d'ensemble",
      icon: BarChart2,
      activeClass:
        "bg-indigo-600 dark:bg-indigo-500 text-white shadow-lg shadow-indigo-500/30",
    },
    {
      key: "canals",
      label: "Analyse par Groupe de Services",
      icon: Layers,
      activeClass:
        "bg-emerald-600 dark:bg-emerald-500 text-white shadow-lg shadow-emerald-500/30",
    },
    {
      key: "analysis",
      label: "Analyse Approfondie",
      icon: Brain,
      activeClass:
        "bg-violet-600 dark:bg-violet-500 text-white shadow-lg shadow-violet-500/30",
    },
    {
      key: "grid",
      label: "Données Brutes",
      icon: Table2,
      activeClass:
        "bg-amber-600 dark:bg-amber-500 text-white shadow-lg shadow-amber-500/30",
    },
    {
      key: "config",
      label: "Config & IA",
      icon: Sparkles,
      activeClass:
        "bg-rose-600 dark:bg-rose-500 text-white shadow-lg shadow-rose-500/30",
    },
  ];
  return (
    <div className="flex items-center gap-1 bg-muted/50 border border-border rounded-xl p-1">
      {tabs.map(({ key, label, icon: Icon, activeClass }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all flex-1 justify-center",
            active === key
              ? activeClass
              : "text-muted-foreground hover:text-foreground hover:bg-muted",
          )}
        >
          <Icon className="w-4 h-4" />
          <span className="hidden sm:inline">{label}</span>
          {counts[key] > 0 && active !== key && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent hidden md:inline">
              {fmtCompact(counts[key])}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
