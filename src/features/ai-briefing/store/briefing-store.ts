/**
 * Briefing Store — persisted Zustand store for AI Intelligence Suite.
 * Tracks last briefing, action plan items, and briefing history.
 *
 * Persistence is durable (IndexedDB via the shared Drizzle storage backend), not
 * localStorage: briefing histories can hold multi-paragraph narratives that blow
 * past the ~5 MB localStorage quota and would otherwise serialize on the main
 * thread. `durablePersist` adds the version + deep-merge migrate + partialize
 * discipline so the persisted shape upgrades cleanly.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDrizzleStorage, durablePersist } from "@/platform/storage";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BriefingType = "briefing" | "anomaly" | "action" | "story";

export interface BriefingEntry {
  id: string;
  text: string;
  generatedAt: string;
  type: BriefingType;
}

export interface ActionPlanItem {
  id: string;
  priority: 1 | 2 | 3 | 4 | 5;
  category: "critical" | "high" | "medium" | "low";
  action: string;
  rationale: string;
  estimatedImpact: string;
  completed: boolean;
  createdAt: string;
}

export type BriefingState = {
  lastBriefing: BriefingEntry | null;
  actionPlanItems: ActionPlanItem[];
  briefingHistory: BriefingEntry[];
  // Actions
  saveBriefing: (text: string, type: BriefingType) => void;
  addActionItems: (items: Omit<ActionPlanItem, "id" | "completed" | "createdAt">[]) => void;
  toggleActionItem: (id: string) => void;
  clearHistory: () => void;
  clearActionPlan: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

const STORE_VERSION = 1;
const MAX_HISTORY = 40;

export const useBriefingStore = create<BriefingState>()(
  persist(
    (set, get) => ({
      lastBriefing: null,
      actionPlanItems: [],
      briefingHistory: [],

      saveBriefing(text, type) {
        const entry: BriefingEntry = {
          id: `briefing_${Date.now()}`,
          text,
          generatedAt: new Date().toISOString(),
          type,
        };
        // Durable IndexedDB storage lifts the old ~5-entry localStorage cap.
        const history = [entry, ...get().briefingHistory].slice(0, MAX_HISTORY);
        set({ lastBriefing: entry, briefingHistory: history });
      },

      addActionItems(items) {
        const newItems: ActionPlanItem[] = items.map((item, idx) => ({
          ...item,
          id: `action_${Date.now()}_${idx}`,
          completed: false,
          createdAt: new Date().toISOString(),
        }));
        set({ actionPlanItems: newItems });
      },

      toggleActionItem(id) {
        set((s) => ({
          actionPlanItems: s.actionPlanItems.map((item) =>
            item.id === id ? { ...item, completed: !item.completed } : item,
          ),
        }));
      },

      clearHistory() {
        set({ briefingHistory: [], lastBriefing: null });
      },

      clearActionPlan() {
        set({ actionPlanItems: [] });
      },
    }),
    {
      ...durablePersist<BriefingState>({
        name: "ai-briefing-store-v1",
        version: STORE_VERSION,
        getDefaults: () => ({
          lastBriefing: null,
          actionPlanItems: [],
          briefingHistory: [],
          // Actions are recreated by the store factory; defaults only need the
          // persisted slice, but the type requires the full shape — supply noops.
          saveBriefing: () => {},
          addActionItems: () => {},
          toggleActionItem: () => {},
          clearHistory: () => {},
          clearActionPlan: () => {},
        }),
        persistKeys: ["lastBriefing", "actionPlanItems", "briefingHistory"],
      }),
      storage: createJSONStorage(() => createDrizzleStorage({ namespace: "store" })),
    },
  ),
);
