"use client";

import { useMemo } from "react";
import { useAIRuntimeStore } from "@/platform/ai/provider";

export type ModelStatusKind = "not-ready" | "downloading" | "ready" | "error";

export interface ModelStatus {
  kind: ModelStatusKind;
  /** 0–100 while downloading/loading. */
  progress: number;
  /** Short human label for the shell pill. */
  label: string;
  /** Selected provider id (or null before detection). */
  providerId: string | null;
  /** Selected model id (or null before detection). */
  model: string | null;
}

/**
 * Shell-level local-model status surface.
 *
 * NL→SQL and insights silently degrade to rule-based logic when the local model
 * is not yet downloaded/cached. This hook reads the unified AI provider runtime
 * store (the single source of truth for the resolved offline provider + live
 * load/inference progress) so the shell can show a "model not yet downloaded /
 * downloading (n%) / ready" affordance instead of leaving first-run users with
 * silent rule-based-only behaviour.
 */
export function useModelStatus(): ModelStatus {
  const progress = useAIRuntimeStore((s) => s.progress);
  const providerId = useAIRuntimeStore((s) => s.providerId);
  const model = useAIRuntimeStore((s) => s.model);

  return useMemo<ModelStatus>(() => {
    switch (progress.status) {
      case "ready":
      case "inferring":
        return { kind: "ready", progress: 100, label: "Model ready", providerId, model };
      case "loading":
        return {
          kind: "downloading",
          progress: Math.round(progress.progress),
          label: `Loading ${Math.round(progress.progress)}%`,
          providerId,
          model,
        };
      case "error":
        return { kind: "error", progress: 0, label: "Model error", providerId, model };
      default:
        return { kind: "not-ready", progress: 0, label: "Rule-based", providerId, model };
    }
  }, [progress.status, progress.progress, providerId, model]);
}
