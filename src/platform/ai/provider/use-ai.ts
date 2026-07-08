"use client";

import { useCallback, useEffect } from "react";
import type { ZodType } from "zod";
import { useModelRequiredDialogStore } from "../models/model-required-dialog-store";
import { useAIRuntimeStore } from "./store";
import type { AIGenerateRequest, AIResult } from "./types";
import { AIUnavailableError } from "./types";

/**
 * `useAI()` — the single entry point feature code should use for inference.
 *
 * It resolves the user-selected (or auto-detected offline) provider, warms the
 * chosen model on first use, streams progress into the global store, and exposes
 * `generate` / `generateStructured` bound to that runtime. Model is optional in
 * requests — the store's selected model is used by default.
 *
 * Example:
 *   const ai = useAI();
 *   const plan = await ai.generateStructured(
 *     { prompt: "Plan an analysis of churn", system: "You are a data analyst." },
 *     PlanSchema,
 *   );
 */
export function useAI() {
  const {
    providerId,
    model,
    progress,
    availability,
    detecting,
    setProvider,
    setModel,
    setProgress,
    refreshAvailability,
    resolveProvider,
  } = useAIRuntimeStore();

  // Detect available offline runtimes once on mount.
  useEffect(() => {
    if (availability.length === 0 && !detecting) void refreshAvailability();
  }, [availability.length, detecting, refreshAvailability]);

  const ensureReady = useCallback(
    async (overrideModel?: string, signal?: AbortSignal) => {
      const provider = await resolveProvider();
      const target = overrideModel ?? model ?? (await provider.listModels())[0]?.id;
      if (!target) throw new Error(`No model available for provider "${provider.id}".`);
      if (!(await provider.isAvailable())) {
        useModelRequiredDialogStore.getState().show("Generating this needs a downloaded AI model.");
        throw new AIUnavailableError(provider.id, "model not downloaded yet");
      }
      await provider.ensureReady(target, setProgress, signal);
      return { provider, model: target };
    },
    [model, resolveProvider, setProgress],
  );

  const generate = useCallback(
    async (req: Omit<AIGenerateRequest, "model"> & { model?: string }): Promise<AIResult> => {
      const { provider, model: target } = await ensureReady(req.model, req.signal);
      setProgress({ status: "inferring", progress: 100 });
      try {
        return await provider.generate({ ...req, model: target });
      } finally {
        setProgress({ status: "ready", progress: 100 });
      }
    },
    [ensureReady, setProgress],
  );

  const generateStructured = useCallback(
    async <T>(
      req: Omit<AIGenerateRequest, "model"> & { model?: string },
      schema: ZodType<T>,
    ): Promise<T> => {
      const { provider, model: target } = await ensureReady(req.model, req.signal);
      setProgress({ status: "inferring", progress: 100 });
      try {
        return await provider.generateStructured({ ...req, model: target }, schema);
      } finally {
        setProgress({ status: "ready", progress: 100 });
      }
    },
    [ensureReady, setProgress],
  );

  return {
    providerId,
    model,
    progress,
    availability,
    detecting,
    setProvider,
    setModel,
    refreshAvailability,
    ensureReady,
    generate,
    generateStructured,
  };
}
