import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDrizzleStorage } from "@/platform/storage/drizzle-storage";

export type AppDomain = "telecom" | "general";

interface AppContextState {
  activeDomain: AppDomain;
  activeDatasetId: string | null;
  activeTableName: string | null;
  setActiveDomain: (activeDomain: AppDomain) => void;
  setActiveDatasetId: (activeDatasetId: string | null) => void;
  setActiveTableName: (activeTableName: string | null) => void;
  setContext: (
    next: Partial<
      Pick<
        AppContextState,
        "activeDomain" | "activeDatasetId" | "activeTableName"
      >
    >,
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
      name: "app-context-v1",
      storage: createJSONStorage(() => createDrizzleStorage({ namespace: "store" })),
      partialize: (s) => ({
        activeDomain: s.activeDomain,
        activeDatasetId: s.activeDatasetId,
        activeTableName: s.activeTableName,
      }),
    },
  ),
);
