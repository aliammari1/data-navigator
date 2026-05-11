import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ActivityType =
  | "dataset_uploaded"
  | "dataset_selected"
  | "telecom_opened"
  | "telecom_analysis_saved"
  | "transform_run"
  | "query_run";

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  message: string;
  datasetId?: string;
  tableName?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

interface ActivityStore {
  events: ActivityEvent[];
  addEvent: (event: Omit<ActivityEvent, "id" | "createdAt">) => void;
  clearEvents: () => void;
}

export const useActivityStore = create<ActivityStore>()(
  persist(
    (set) => ({
      events: [],
      addEvent: (event) =>
        set((s) => ({
          events: [
            {
              ...event,
              id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              createdAt: new Date().toISOString(),
            },
            ...s.events,
          ].slice(0, 500),
        })),
      clearEvents: () => set({ events: [] }),
    }),
    {
      name: "workspace-activity-v1",
      partialize: (s) => ({ events: s.events }),
    },
  ),
);
