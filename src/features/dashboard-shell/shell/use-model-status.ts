"use client";

import { useEffect, useMemo } from "react";
import {
  type DownloadState,
  type ModelStatusRecord,
  useModelStatus as usePlatformModelStatus,
} from "@/platform/ai/models/use-model-status";
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
  /** All probed model records from disk. */
  records: ModelStatusRecord[];
  /** Downloaded models currently available on disk. */
  presentModels: ModelStatusRecord[];
  /** Downloaded chat (LLM) models. */
  chatModels: ModelStatusRecord[];
  /** Active model record if resolved. */
  activeRecord: ModelStatusRecord | null;
  /** Per-key download state map. */
  downloads: Record<string, DownloadState>;
  /** Start a download for a model key. */
  download: (key: string) => Promise<void>;
  /** Cancel a download for a model key. */
  cancel: (key: string) => Promise<void>;
  /** Refresh presence from disk. */
  refresh: () => Promise<void>;
  /** Set active chat model file. */
  selectModel: (fileOrKey: string) => void;
  /** Loading state of disk probe. */
  loading: boolean;
}

/**
 * Shell-level local-model status surface.
 *
 * Checks both actual on-disk model weights via the offline platform probe and
 * live inference/download progress. If models are downloaded on disk, it surfaces
 * the active local model (e.g. "Gemma 4 E2B", "Qwen3 1.7B") instead of erroneously
 * reporting "Rule-based" while idle.
 */
export function useModelStatus(): ModelStatus {
  const {
    records,
    loading,
    ready: platformReady,
    downloads,
    download,
    cancel,
    refresh,
  } = usePlatformModelStatus(["llm", "embed"]);

  const storeProgress = useAIRuntimeStore((s) => s.progress);
  const providerId = useAIRuntimeStore((s) => s.providerId);
  const activeModelId = useAIRuntimeStore((s) => s.model);
  const setModel = useAIRuntimeStore((s) => s.setModel);

  // Present records
  const presentModels = useMemo(() => records.filter((r) => r.state === "present"), [records]);

  const chatModels = useMemo(
    () => records.filter((r) => r.lane === "llm" && r.state === "present"),
    [records],
  );

  // Active record resolution
  const activeRecord = useMemo(() => {
    if (!activeModelId) return chatModels[0] ?? null;
    return (
      records.find(
        (r) =>
          r.key === activeModelId ||
          `${r.key}.gguf` === activeModelId ||
          (r.lane === "llm" && activeModelId.startsWith(r.key)),
      ) ??
      chatModels[0] ??
      null
    );
  }, [activeModelId, records, chatModels]);

  // Auto-initialize activeModel in the store if models are present but no model is selected
  useEffect(() => {
    if (!activeModelId && chatModels.length > 0) {
      const best = chatModels[0];
      const file = `${best.key}.gguf`;
      setModel(file);
    }
  }, [activeModelId, chatModels, setModel]);

  // Compute status kind and human-readable label
  const statusInfo = useMemo(() => {
    // 1. Any download in progress?
    const activeDl = Object.values(downloads).find((d) => d.active);
    if (activeDl) {
      const pct = activeDl.percent >= 0 ? Math.round(activeDl.percent) : 0;
      return {
        kind: "downloading" as const,
        progress: pct,
        label: `Downloading ${pct}%`,
      };
    }

    // 2. Runtime store actively loading or inferring?
    if (storeProgress.status === "loading") {
      const pct = Math.round(storeProgress.progress);
      return {
        kind: "downloading" as const,
        progress: pct,
        label: `Loading ${pct}%`,
      };
    }

    if (storeProgress.status === "error") {
      return {
        kind: "error" as const,
        progress: 0,
        label: "Model error",
      };
    }

    // 3. Are any models present on disk?
    if (chatModels.length > 0 || platformReady) {
      const activeFamily = activeRecord
        ? `${activeRecord.family}${activeRecord.sizeLabel ? ` ${activeRecord.sizeLabel}` : ""}`
        : "Local AI ready";
      return {
        kind: "ready" as const,
        progress: 100,
        label: activeFamily,
      };
    }

    // 4. Probing still in flight?
    if (loading) {
      return {
        kind: "not-ready" as const,
        progress: 0,
        label: "Checking models…",
      };
    }

    // 5. Fallback: rule-based
    return {
      kind: "not-ready" as const,
      progress: 0,
      label: "Rule-based",
    };
  }, [
    downloads,
    storeProgress.status,
    storeProgress.progress,
    chatModels.length,
    platformReady,
    activeRecord,
    loading,
  ]);

  const selectModel = (fileOrKey: string) => {
    const file = fileOrKey.endsWith(".gguf") ? fileOrKey : `${fileOrKey}.gguf`;
    setModel(file);
  };

  return {
    kind: statusInfo.kind,
    progress: statusInfo.progress,
    label: statusInfo.label,
    providerId,
    model: activeModelId,
    records,
    presentModels,
    chatModels,
    activeRecord,
    downloads,
    download,
    cancel,
    refresh,
    selectModel,
    loading,
  };
}
