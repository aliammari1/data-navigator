"use client";

/**
 * Keyed reconciliation annotation store.
 *
 * The legacy wizard stored per-row `reasonCode`/`notes`/`escalated` in a single
 * positional `Discrepancy[]` and cloned the *entire* array on every keystroke,
 * forcing a re-render of every row. This store keys annotations by the diff
 * row's stable composite key, so editing one row's notes touches only that row's
 * slice — and only components subscribed to that key re-render.
 *
 * State is intentionally scoped to a single in-progress run. Cross-run history /
 * durable persistence (Dexie or the Electron-main SQLite store) is a separate,
 * shared concern not wired here — see the structured report.
 */

import { create } from "zustand";

export interface RowAnnotation {
  reasonCode: string;
  notes: string;
  escalated: boolean;
  /** AI-generated hypothesis text, when available. */
  hypothesis: string;
  /** Model confidence for the hypothesis (0–1), when available. */
  confidence: number | null;
}

export const EMPTY_ANNOTATION: RowAnnotation = {
  reasonCode: "Unknown",
  notes: "",
  escalated: false,
  hypothesis: "",
  confidence: null,
};

interface AnnotationsState {
  /** Identifies the run these annotations belong to; resets clear stale state. */
  runId: string | null;
  annotations: Record<string, RowAnnotation>;
  /** Begin a fresh run, clearing any previous annotations. */
  startRun: (runId: string) => void;
  reset: () => void;
  setAnnotation: (key: string, patch: Partial<RowAnnotation>) => void;
  getAnnotation: (key: string) => RowAnnotation;
}

export const useAnnotationsStore = create<AnnotationsState>((set, get) => ({
  runId: null,
  annotations: {},
  startRun: (runId) => {
    if (get().runId === runId) return;
    set({ runId, annotations: {} });
  },
  reset: () => set({ runId: null, annotations: {} }),
  setAnnotation: (key, patch) =>
    set((state) => ({
      annotations: {
        ...state.annotations,
        [key]: { ...EMPTY_ANNOTATION, ...state.annotations[key], ...patch },
      },
    })),
  getAnnotation: (key) => get().annotations[key] ?? EMPTY_ANNOTATION,
}));

/** Stable selector hook for a single row's annotation (minimizes re-renders). */
export function useRowAnnotation(key: string): RowAnnotation {
  return useAnnotationsStore((s) => s.annotations[key] ?? EMPTY_ANNOTATION);
}
