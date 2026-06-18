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
        // Honor an explicit, currently-available choice — EXCEPT a persisted
        // "transformers", which is almost always a stale browser fallback that
        // was auto-selected before the Electron GGUF bridge (window.electronLlama)
        // finished initializing. Returning it blindly stranded callers like the
        // AI Commander on the WASM lane (which then failed to load a backend
        // offline) even though the canonical llamacpp lane was live. Re-pick so
        // llamacpp wins whenever it is actually available.
        if (providerId && providerId !== "transformers") {
          const chosen = getProvider(providerId);
          if (await chosen.isAvailable().catch(() => false)) return chosen;
        }
        const def = await pickDefaultProvider(); // walks llamacpp → transformers → …
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
