import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { createDrizzleStorage } from "@/platform/storage/drizzle-storage";

/**
 * Report draft store — the missing analyse→rapporter edge (blueprint §3).
 *
 * Analysis screens (ai-analysis, deep-analytics, forecast, geo, briefing) push
 * an insight / chart spec here via "Ajouter au rapport"; Report Studio reads the
 * staged items and pre-populates a draft. Built once, consumed everywhere, so no
 * analysis surface is an island.
 */
export type ReportDraftKind = "insight" | "chart" | "kpi" | "table" | "note";

export interface ReportDraftItem {
  id: string;
  kind: ReportDraftKind;
  title: string;
  /** Human-readable summary or body. */
  summary?: string;
  /** Originating feature (e.g. "ai-analysis"), for grouping in the Studio. */
  source: string;
  datasetId?: string;
  /** Opaque spec the Studio knows how to render (chart config, table rows…). */
  payload?: unknown;
  createdAt: string;
}

const MAX_DRAFT_ITEMS = 200;

interface ReportDraftStore {
  items: ReportDraftItem[];
  addItem: (item: Omit<ReportDraftItem, "id" | "createdAt">) => void;
  removeItem: (id: string) => void;
  clear: () => void;
}

export const useReportDraftStore = create<ReportDraftStore>()(
  persist(
    (set) => ({
      items: [],
      addItem: (item) =>
        set((s) => ({
          items: [
            {
              ...item,
              id: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              createdAt: new Date().toISOString(),
            },
            ...s.items,
          ].slice(0, MAX_DRAFT_ITEMS),
        })),
      removeItem: (id) => set((s) => ({ items: s.items.filter((item) => item.id !== id) })),
      clear: () => set({ items: [] }),
    }),
    {
      name: "report-draft-v1",
      version: 1,
      storage: createJSONStorage(() => createDrizzleStorage({ namespace: "store" })),
      partialize: (s) => ({ items: s.items }),
    },
  ),
);

export const useReportDraftItems = () => useReportDraftStore((s) => s.items);

export const useReportDraftCount = () => useReportDraftStore((s) => s.items.length);

export const useReportDraftActions = () =>
  useReportDraftStore(
    useShallow((s) => ({
      addItem: s.addItem,
      removeItem: s.removeItem,
      clear: s.clear,
    })),
  );
