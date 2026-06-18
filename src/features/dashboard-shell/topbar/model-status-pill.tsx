"use client";

import { Cpu, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { useModelStatus } from "@/features/dashboard-shell/shell/use-model-status";
import { cn } from "@/shared/utils";

/**
 * Compact local-model status pill.
 *
 * Surfaces whether the on-device model is downloaded/cached so first-run users
 * are not silently dropped into rule-based-only NL→SQL with no indication. Reads
 * the unified AI provider runtime (no fabricated state).
 */
export function ModelStatusPill() {
  const status = useModelStatus();

  const config = {
    ready: {
      Icon: Sparkles,
      tone: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
      title: "Local AI model is ready",
    },
    downloading: {
      Icon: Loader2,
      tone: "border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-300",
      title: "Local AI model is loading",
    },
    error: {
      Icon: TriangleAlert,
      tone: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300",
      title: "Local AI model failed to load — rule-based fallback in use",
    },
    "not-ready": {
      Icon: Cpu,
      tone: "border-border bg-accent text-muted-foreground",
      title: "Local AI model not downloaded yet — using rule-based NL→SQL",
    },
  }[status.kind];

  const { Icon } = config;

  return (
    <span
      title={config.title}
      className={cn(
        "hidden lg:inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-medium transition-colors",
        config.tone,
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", status.kind === "downloading" && "animate-spin")} />
      <span>{status.label}</span>
    </span>
  );
}
