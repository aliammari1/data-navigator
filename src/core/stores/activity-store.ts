import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { createDrizzleStorage } from "@/platform/storage/drizzle-storage";

export type ActivityType =
  | "dataset_uploaded"
  | "dataset_selected"
  | "telecom_opened"
  | "telecom_analysis_saved"
  | "transform_run"
  | "query_run";

const KNOWN_ACTIVITY_TYPES: ReadonlySet<ActivityType> = new Set<ActivityType>([
  "dataset_uploaded",
  "dataset_selected",
  "telecom_opened",
  "telecom_analysis_saved",
  "transform_run",
  "query_run",
]);

const MAX_ACTIVITY_EVENTS = 500;

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
          ].slice(0, MAX_ACTIVITY_EVENTS),
        })),
      clearEvents: () => set({ events: [] }),
    }),
    {
      name: "workspace-activity-v1",
      version: 1,
      storage: createJSONStorage(() => createDrizzleStorage({ namespace: "store" })),
      // Drop events whose type is no longer in the known union and re-cap.
      migrate: (persisted, _version) => {
        const prev = (persisted ?? {}) as { events?: unknown[] };
        const events = Array.isArray(prev.events)
          ? (prev.events as ActivityEvent[])
              .filter(
                (event) =>
                  !!event && KNOWN_ACTIVITY_TYPES.has(event.type),
              )
              .slice(0, MAX_ACTIVITY_EVENTS)
          : [];
        return { events };
      },
      partialize: (s) => ({ events: s.events }),
    },
  ),
);

// ─── Selector hooks ─────────────────────────────────────────────────────────

export const useActivityEvents = () => useActivityStore((s) => s.events);

export const useActivityActions = () =>
  useActivityStore(
    useShallow((s) => ({
      addEvent: s.addEvent,
      clearEvents: s.clearEvents,
    })),
  );
