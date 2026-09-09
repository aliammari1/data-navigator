import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDrizzleStorage } from "@/platform/storage";
import { detectAvailability, getProvider, pickDefaultProvider } from "./registry";
import type { AIProgress, AIProvider, ProviderId } from "./types";

/**
 * Global AI runtime selection store.
 *
 * Persists the user's chosen provider + model durably in drizzle (namespace
 * "settings", with a synchronous localStorage working copy) so the offline
 * runtime survives reloads AND is included in settings backup/restore, and
 * tracks live load/inference progress for UI (model-selector, readiness
 * center). Availability is detected lazily.
 */

interface AIRuntimeState {
  providerId: ProviderId | null;
  model: string | null;
  /** Per-call live progress (load + inference). */
  progress: AIProgress;
  availability: { id: ProviderId; label: string; available: boolean }[];
  detecting: boolean;

  setProvider: (id: ProviderId) => void;
  setModel: (model: string) => void;
  setProgress: (p: AIProgress) => void;
  /** Probe providers and auto-select an offline default if none chosen. */
  refreshAvailability: () => Promise<void>;
  /** The resolved provider object (or an offline default). */
  resolveProvider: () => Promise<AIProvider>;
}

const IDLE: AIProgress = { status: "idle", progress: 0 };

export const useAIRuntimeStore = create<AIRuntimeState>()(
  persist(
    (set, get) => ({
      providerId: null,
      model: null,
      progress: IDLE,
      availability: [],
      detecting: false,

      setProvider: (id) => set({ providerId: id, progress: IDLE }),
      setModel: (model) => set({ model }),
      setProgress: (progress) => set({ progress }),

      async refreshAvailability() {
        set({ detecting: true });
        try {
          const availability = await detectAvailability();
          set({ availability });
          if (!get().providerId) {
            const def = await pickDefaultProvider();
            const models = await def.listModels().catch(() => []);
            set({ providerId: def.id, model: get().model ?? models[0]?.id ?? null });
          }
        } finally {
          set({ detecting: false });
        }
      },

      async resolveProvider() {
        const { providerId } = get();
        // Honor an explicit, currently-available choice. `providerId` is typed
        // as the current `ProviderId` union, but the persisted value is
        // untyped JSON — a profile from before a provider was removed (e.g.
        // "transformers", "ollama", "openai" pre-dating the node-llama-cpp-only
        // migration) can still be sitting in storage. `getProvider` throws for
        // anything the registry doesn't recognize, so treat that the same as
        // "no preference" and fall through to pickDefaultProvider().
        if (providerId) {
          try {
            const chosen = getProvider(providerId);
            if (await chosen.isAvailable().catch(() => false)) return chosen;
          } catch {
            // Stale/unknown persisted providerId — fall through below.
          }
        }
        const def = await pickDefaultProvider();
        set({ providerId: def.id });
        return def;
      },
    }),
    {
      name: "ai-runtime",
      storage: createJSONStorage(() => createDrizzleStorage({ namespace: "settings" })),
      partialize: (s) => ({ providerId: s.providerId, model: s.model }),
    },
  ),
);
