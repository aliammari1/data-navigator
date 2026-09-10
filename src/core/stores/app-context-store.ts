import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { STORAGE_KEYS } from "@/platform/storage";
import { createDrizzleStorage } from "@/platform/storage/drizzle-storage";

export type AppDomain = "telecom" | "general";

const APP_DOMAINS: ReadonlySet<AppDomain> = new Set<AppDomain>(["telecom", "general"]);

interface AppContextState {
  activeDomain: AppDomain;
  activeDatasetId: string | null;
  activeTableName: string | null;
  setActiveDomain: (activeDomain: AppDomain) => void;
  setActiveDatasetId: (activeDatasetId: string | null) => void;
  setActiveTableName: (activeTableName: string | null) => void;
  setContext: (
    next: Partial<Pick<AppContextState, "activeDomain" | "activeDatasetId" | "activeTableName">>,
  ) => void;
}

export const useAppContextStore = create<AppContextState>()(
  persist(
    (set) => ({
      activeDomain: "telecom",
      activeDatasetId: null,
      activeTableName: null,
      setActiveDomain: (activeDomain) => set({ activeDomain }),
      setActiveDatasetId: (activeDatasetId) => set({ activeDatasetId }),
      setActiveTableName: (activeTableName) => set({ activeTableName }),
      setContext: (next) => set((state) => ({ ...state, ...next })),
    }),
    {
      name: STORAGE_KEYS.appContext,
      version: 1,
      storage: createJSONStorage(() => createDrizzleStorage({ namespace: "store" })),
      // Ensure a valid AppDomain (fallback 'telecom'); ids are left as-is —
      // cross-store id validation belongs to consumers (out of scope here).
      migrate: (persisted, _version) => {
        const prev = (persisted ?? {}) as Partial<AppContextState>;
        const activeDomain =
          prev.activeDomain && APP_DOMAINS.has(prev.activeDomain) ? prev.activeDomain : "telecom";
        return {
          activeDomain,
          activeDatasetId: prev.activeDatasetId ?? null,
          activeTableName: prev.activeTableName ?? null,
        };
      },
      partialize: (s) => ({
        activeDomain: s.activeDomain,
        activeDatasetId: s.activeDatasetId,
        activeTableName: s.activeTableName,
      }),
    },
  ),
);

// ─── Selector hooks ─────────────────────────────────────────────────────────

export const useAppContextSlice = () =>
  useAppContextStore(
    useShallow((s) => ({
      activeDomain: s.activeDomain,
      activeDatasetId: s.activeDatasetId,
      activeTableName: s.activeTableName,
    })),
  );

export const useAppContextActions = () =>
  useAppContextStore(
    useShallow((s) => ({
      setActiveDomain: s.setActiveDomain,
      setActiveDatasetId: s.setActiveDatasetId,
      setActiveTableName: s.setActiveTableName,
      setContext: s.setContext,
    })),
  );
