"use client";

/**
 * AI bridge for the agent-canvas pipeline.
 *
 * The pipeline (schema → planner → sql → narrator) runs OUTSIDE React, so it
 * cannot use the `useAI()` hook. This module is the non-hook entry point onto
 * the SAME foundation provider registry (`@/platform/ai/provider`): it resolves
 * the best available offline provider (llamacpp in Electron → transformers.js
 * browser worker → …), warms the selected model once, and exposes the small
 * surface the agents need:
 *
 *   - `aiReady()`            — is a usable provider+model present right now?
 *   - `aiChat(system,user)`  — free-form text (replaces the old `./llm` `chat`)
 *   - `aiStructured(schema)` — grammar-valid JSON by construction (replaces the
 *                              regex/parseJSON repair loop)
 *
 * There is NO Math.random, no CDN, no hand-rolled JSON repair: structured output
 * is produced by the provider's native grammar path (llamacpp GBNF) or the
 * registry's prompt+Zod fallback (transformers.js). Every offline/env concern is
 * owned by the platform adapters, not duplicated here.
 */

import type { ZodType } from "zod";
import {
  pickDefaultProvider,
  useAIRuntimeStore,
} from "@/platform/ai/provider";
import type { AIProvider } from "@/platform/ai/provider";

interface Resolved {
  provider: AIProvider;
  model: string;
}

let _resolved: Resolved | null = null;
let _warming: Promise<Resolved> | null = null;

function selectedModelId(): string | undefined {
  // Honour the user's chosen model from the shared runtime store; the pipeline
  // and SetupScreen write to this store, so the screen and the agents agree.
  return useAIRuntimeStore.getState().model ?? undefined;
}

/**
 * Resolve + warm the provider/model exactly once (idempotent). Concurrent
 * callers share the same in-flight promise so we never load twice.
 */
async function ensureResolved(): Promise<Resolved> {
  const want = selectedModelId();
  if (_resolved && (!want || _resolved.model === want)) return _resolved;
  if (_warming) return _warming;

  _warming = (async () => {
    const prefer = useAIRuntimeStore.getState().providerId ?? undefined;
    const provider = await pickDefaultProvider(prefer ?? undefined);
    const models = await provider.listModels().catch(() => []);
    const model = want ?? models[0]?.id;
    if (!model) {
      throw new Error(`No model available for provider "${provider.id}".`);
    }
    await provider.ensureReady(model, (p) =>
      useAIRuntimeStore.getState().setProgress(p),
    );
    _resolved = { provider, model };
    return _resolved;
  })();

  try {
    return await _warming;
  } finally {
    _warming = null;
  }
}

/** Eagerly warm the runtime (called from SetupScreen "Load Model"). */
export async function warmAI(modelId?: string): Promise<void> {
  if (modelId) useAIRuntimeStore.getState().setModel(modelId);
  _resolved = null; // force re-resolve against the newly selected model
  await ensureResolved();
}

/**
 * Is a usable provider+model present? Cheap probe that never throws — the
 * pipeline uses this to decide LLM vs deterministic-heuristic paths.
 */
export async function aiReady(): Promise<boolean> {
  try {
    const want = selectedModelId();
    if (_resolved && (!want || _resolved.model === want)) return true;
    const prefer = useAIRuntimeStore.getState().providerId ?? undefined;
    const provider = await pickDefaultProvider(prefer ?? undefined);
    return await provider.isAvailable().catch(() => false);
  } catch {
    return false;
  }
}

/** Synchronous best-effort readiness (only true once warmed). */
export function aiReadySync(): boolean {
  const want = selectedModelId();
  return _resolved !== null && (!want || _resolved.model === want);
}

export interface AIChatOptions {
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  onToken?: (token: string) => void;
}

/**
 * Free-form chat completion through the resolved provider. Streams tokens to
 * `onToken` when the provider supports it.
 */
export async function aiChat(
  system: string,
  user: string,
  opts: AIChatOptions = {},
): Promise<string> {
  const { provider, model } = await ensureResolved();
  const result = await provider.generate({
    model,
    system,
    prompt: user,
    maxTokens: opts.maxTokens ?? 512,
    temperature: opts.temperature ?? 0,
    signal: opts.signal,
    onToken: opts.onToken,
  });
  return result.text.trim();
}

/**
 * Schema-validated structured generation. Uses the provider's native
 * grammar-constrained path when available (llamacpp), otherwise the registry's
 * prompt+repair+Zod fallback (transformers.js). The returned value is
 * guaranteed to satisfy `schema`.
 */
export async function aiStructured<T>(
  system: string,
  user: string,
  schema: ZodType<T>,
  opts: { maxTokens?: number; signal?: AbortSignal } = {},
): Promise<T> {
  const { provider, model } = await ensureResolved();
  return provider.generateStructured(
    {
      model,
      system,
      prompt: user,
      maxTokens: opts.maxTokens ?? 1024,
      signal: opts.signal,
    },
    schema,
  );
}

/** Drop the cached runtime (on reset / dataset switch). */
export function resetAI(): void {
  _resolved = null;
  _warming = null;
}
