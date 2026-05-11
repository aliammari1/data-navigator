"use client";
/**
 * Auto-Analyst store. Keyed by tableName so switching tables doesn't lose work.
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type {
  AnalystState,
  AnalystStepId,
  LineageEntry,
  StepState,
} from "./types";

type StateMap = Record<string, AnalystState>;

interface Store {
  current: string;
  states: StateMap;
  setCurrent: (table: string) => void;
  ensure: (table: string) => void;
  patch: (table: string, p: Partial<AnalystState>) => void;
  setStep: <K extends keyof AnalystState>(
    table: string,
    key: K,
    value: AnalystState[K],
  ) => void;
  log: (table: string, entry: Omit<LineageEntry, "id" | "ts">) => void;
  reset: (table: string) => void;
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

const emptyState = (table: string): AnalystState => ({
  table,
  lineage: [],
});

export const useAnalystStore = create<Store>()(
  subscribeWithSelector((set, get) => ({
    current: "",
    states: {},

    setCurrent: (table) => {
      get().ensure(table);
      set({ current: table });
    },

    ensure: (table) => {
      const { states } = get();
      if (!states[table]) {
        set({ states: { ...states, [table]: emptyState(table) } });
      }
    },

    patch: (table, p) => {
      const { states } = get();
      const cur = states[table] ?? emptyState(table);
      set({ states: { ...states, [table]: { ...cur, ...p } } });
    },

    setStep: (table, key, value) => {
      get().patch(table, { [key]: value } as Partial<AnalystState>);
    },

    log: (table, entry) => {
      const { states } = get();
      const cur = states[table] ?? emptyState(table);
      const newEntry: LineageEntry = { id: genId(), ts: Date.now(), ...entry };
      set({
        states: {
          ...states,
          [table]: {
            ...cur,
            lineage: [newEntry, ...cur.lineage].slice(0, 200),
          },
        },
      });
    },

    reset: (table) => {
      const { states } = get();
      set({ states: { ...states, [table]: emptyState(table) } });
    },
  })),
);

export function makeStepState<T>(
  status: StepState<T>["status"],
  partial: Omit<StepState<T>, "status"> = {},
): StepState<T> {
  return { status, ...partial };
}

// Reusable step ids in execution order.
export const STEP_ORDER: AnalystStepId[] = [
  "brief",
  "profile",
  "quality",
  "hypotheses",
  "statistics",
  "distributions",
  "anomalies",
  "correlations",
  "segmentation",
  "forecast",
  "cohort",
  "funnel",
  "rfm",
  "narrative",
  "recommendations",
  "sandbox",
  "sql",
  "report",
  "lineage",
];
