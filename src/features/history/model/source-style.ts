import { Activity, Table2, Upload, WandSparkles } from "lucide-react";
import type { ComponentType } from "react";

import type { HistorySource } from "./types";

export interface SourceStyle {
  icon: ComponentType<{ className?: string }>;
  dot: string;
  badge: string;
}

const STYLES: Record<HistorySource, SourceStyle> = {
  dataset: {
    icon: Upload,
    dot: "bg-emerald-500",
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  transform: {
    icon: WandSparkles,
    dot: "bg-indigo-500",
    badge: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  },
  query: {
    icon: Table2,
    dot: "bg-cyan-500",
    badge: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  },
  activity: {
    icon: Activity,
    dot: "bg-amber-500",
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
};

export function sourceStyle(source: HistorySource): SourceStyle {
  return STYLES[source] ?? STYLES.activity;
}
