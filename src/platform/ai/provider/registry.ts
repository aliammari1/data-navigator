import { llamacppProvider } from "./adapters/llamacpp";
import type { AIProvider, ProviderId } from "./types";

/**
 * Provider registry + offline-first auto-selection.
 *
 * node-llama-cpp is the sole provider: an Electron main-process GGUF lane with
 * grammar-constrained JSON (the structured-output winner), offline by
 * construction. The registry/`pickDefaultProvider` shape stays in place (rather
 * than callers reaching for `llamacppProvider` directly) so a future provider
 * can be added without touching every call site.
 */
export const PROVIDERS: readonly AIProvider[] = [llamacppProvider] as const;

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
  if (prefer) {
    const preferred = BY_ID.get(prefer);
    if (preferred && (await preferred.isAvailable().catch(() => false))) return preferred;
  }

  for (const provider of PROVIDERS) {
    if (await provider.isAvailable().catch(() => false)) return provider;
  }

  return PROVIDERS[0];
}
