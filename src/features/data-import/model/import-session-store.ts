"use client";

/**
 * Keyed-by-id import session store.
 *
 * The previous screen held all in-flight files in a single React `useState`
 * array and rebuilt the ENTIRE array with `produce()` on every progress tick.
 * With N files and ~5 status transitions each, that re-cloned and re-rendered
 * the whole list O(N) times per import.
 *
 * Here each file is stored under its id and a `FileRow` subscribes only to its
 * own slice (`useImportSession(s => s.files[id])`), so a progress update for one
 * file re-renders just that row — O(1) instead of O(N).
 */

import { create } from "zustand";
import type { ParsedFileInfo } from "./types";

interface ImportSessionState {
  /** Files keyed by id for O(1) narrow subscriptions. */
  files: Record<string, ParsedFileInfo>;
  /** Display order (most recent first), used as the virtualization index. */
  order: string[];

  add: (file: ParsedFileInfo) => void;
  patch: (id: string, patch: Partial<ParsedFileInfo>) => void;
  remove: (id: string) => void;
  reset: () => void;
}

export const useImportSession = create<ImportSessionState>((set) => ({
  files: {},
  order: [],

  add: (file) =>
    set((state) => ({
      files: { ...state.files, [file.id]: file },
      order: state.order.includes(file.id) ? state.order : [file.id, ...state.order],
    })),

  patch: (id, patch) =>
    set((state) => {
      const existing = state.files[id];
      if (!existing) return state;
      return {
        files: { ...state.files, [id]: { ...existing, ...patch } },
      };
    }),

  remove: (id) =>
    set((state) => {
      if (!(id in state.files)) return state;
      const { [id]: _removed, ...rest } = state.files;
      return {
        files: rest,
        order: state.order.filter((entry) => entry !== id),
      };
    }),

  reset: () => set({ files: {}, order: [] }),
}));

/** Snapshot of files in display order (non-reactive). */
export function getOrderedFiles(): ParsedFileInfo[] {
  const { files, order } = useImportSession.getState();
  return order.map((id) => files[id]).filter(Boolean) as ParsedFileInfo[];
}
