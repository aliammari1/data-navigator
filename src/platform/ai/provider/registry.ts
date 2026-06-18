import { llamacppProvider } from "./adapters/llamacpp";
import { ollamaProvider } from "./adapters/ollama";
import { openaiProvider } from "./adapters/openai";
import { transformersProvider } from "./adapters/transformers";
import { isWebLLMOptIn, webllmProvider } from "./adapters/webllm";
import type { AIProvider, ProviderId } from "./types";

/**
 * Provider registry + offline-first auto-selection.
 *
 * Order matters: it is the preference order used by `pickDefaultProvider` when
 * several providers are available. Preference, best → fallback:
 *   1. llamacpp     — Electron main-process GGUF lane with grammar-constrained
 *                     JSON (the structured-output winner). Default in Electron.
 *   2. transformers — fully-offline WASM/CPU browser lane; the guaranteed floor.
 *   3. webllm       — WebGPU-only accelerator, DEMOTED: never auto-default, only
 *                     when a real WebGPU adapter is detected AND the user opts in.
 *   4. ollama       — optional local server escape hatch.
 *   5. openai       — optional OpenAI-compatible endpoint (not offline).
 */
export const PROVIDERS: readonly AIProvider[] = [
  llamacppProvider,
  transformersProvider,
  webllmProvider,
  ollamaProvider,
  openaiProvider,
] as const;

const BY_ID = new Map<ProviderId, AIProvider>(PROVIDERS.map((p) => [p.id, p]));

export function getProvider(id: ProviderId): AIProvider {
  const provider = BY_ID.get(id);
  if (!provider) throw new Error(`Unknown AI provider: ${id}`);
  return provider;
}

export function listProviders(): readonly AIProvider[] {
  return PROVIDERS;
}

export interface ProviderAvailability {
  id: ProviderId;
  label: string;
  available: boolean;
}

/** Probe every provider concurrently. Used to populate the model selector. */
export async function detectAvailability(): Promise<ProviderAvailability[]> {
  return Promise.all(
    PROVIDERS.map(async (p) => ({
      id: p.id,
      label: p.label,
      available: await p.isAvailable().catch(() => false),
    })),
  );
}

/**
 * Pick the best available provider, honouring an optional preference.
 * Falls back through the registry order; returns the first provider as a last
 * resort so callers always get a usable object (it will surface its own
 * unavailability when invoked).
 */
export async function pickDefaultProvider(prefer?: ProviderId): Promise<AIProvider> {
  // An explicit preference is always honoured (this is how a user opts in to
  // webllm), provided the runtime is actually usable right now.
  if (prefer) {
    const preferred = BY_ID.get(prefer);
    if (preferred && (await preferred.isAvailable().catch(() => false))) return preferred;
  }

  // Auto-selection walks the registry order (llamacpp → transformers → …). The
  // WebGPU-only webllm lane is intentionally skipped here so it can never become
  // the silent default on the no-WebGPU target — it is reachable only via an
  // explicit `prefer` (set when the user opts in).
  for (const provider of PROVIDERS) {
    if (provider.id === "webllm" && !isWebLLMOptIn()) continue;
    if (await provider.isAvailable().catch(() => false)) return provider;
  }

  // Last resort: the first lane that is at least *available*, else the leading
  // provider (it surfaces its own unavailability when invoked).
  for (const provider of PROVIDERS) {
    if (provider.id === "webllm") continue;
    if (await provider.isAvailable().catch(() => false)) return provider;
  }
  return PROVIDERS[0];
}
