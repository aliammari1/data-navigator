"use client";

/**
 * Model status / readiness bar.
 *
 * Surfaces the unified provider runtime state (offline-first) instead of the
 * legacy WebGPU-only engine. It reports which provider is selected, live
 * load/inference progress, and a one-time "ready, works offline" signal once a
 * model has been warmed.
 */

import { Brain, Cpu, Wifi, WifiOff, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAI } from "@/platform/ai/provider";
import { cn } from "@/shared/utils";

export function ModelStatusBar({ onWarm, warming }: { onWarm?: () => void; warming?: boolean }) {
  const { providerId, progress, availability } = useAI();

  const offlineCapable = availability.some(
    (a) => a.available && (a.id === "transformers"  ),
  );
  const status = progress.status;
  const loading = status === "loading" || warming;
  const inferring = status === "inferring";
  const ready = status === "ready";

  const providerLabel =
    providerId === "transformers"
      ? "Transformers.js (WASM/WebGPU)"
  : providerId === "ollama"
          ? "Ollama (local)"
          : providerId === "openai"
            ? "OpenAI-compatible"
            : "Auto (offline-first)";

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
        <Brain className="size-4 shrink-0 animate-pulse text-primary" />
        <div className="flex-1">
          <p className="mb-1 text-primary">
            Loading {providerLabel} model… {progress.progress}%
          </p>
          <Progress value={progress.progress} className="h-1.5" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border px-4 py-2.5 text-xs",
        inferring
          ? "border-primary/30 bg-primary/5"
          : ready
            ? "border-emerald-500/20 bg-emerald-500/5"
            : "border-border bg-card/40",
      )}
    >
      <Cpu className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">Engine:</span>
      <span className="font-medium">{providerLabel}</span>

      {offlineCapable ? (
        <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">
          <WifiOff className="size-3" />
          Runs offline
        </span>
      ) : (
        <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">
          <Wifi className="size-3" />
          Detecting runtimes…
        </span>
      )}

      {inferring && <span className="text-primary">· generating…</span>}
      {ready && <span className="text-emerald-300">· model cached</span>}

      {onWarm && status === "idle" && (
        <Button size="sm" variant="outline" className="ml-auto h-7" onClick={onWarm}>
          <Zap className="size-3" />
          Warm up model
        </Button>
      )}
    </div>
  );
}
