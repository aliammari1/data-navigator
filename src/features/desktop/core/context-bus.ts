"use client";

import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

/**
 * Cross-window coordination bus.
 *
 * A tiny, ephemeral (NOT persisted) zustand store that lets every open desktop
 * window agree on two shared facts:
 *
 *  1. `selection` — "what is currently selected anywhere on the desktop". This
 *     drives the Inspector panel, Quick Look, and select-to-ask flows. Any
 *     window can publish its current selection; any window can read it.
 *  2. `crossFilter` — a single shared dimension/value filter ("linked views").
 *     Charts and tables can subscribe to it so that selecting `SMS` in one
 *     window filters every other window that opted in.
 *
 * Both values are global and singular by design — there is exactly one active
 * selection and one active cross-filter for the whole desktop session.
 */

/** The kind of thing currently selected somewhere on the desktop. */
export type DesktopSelectionKind =
  | "dataset"
  | "folder"
  | "chart"
  | "kpi"
  | "column"
  | "window"
  | null;

/** What is currently selected anywhere on the desktop (drives Inspector / Quick Look / select-to-ask). */
export interface DesktopSelection {
  kind: DesktopSelectionKind;
  id?: string;
  label?: string;
  meta?: Record<string, unknown>;
}

/** A shared dimension/value filter broadcast to opted-in "linked" windows. */
export type CrossFilter = { dimension: string; value: string } | null;

const EMPTY_SELECTION: DesktopSelection = { kind: null };

interface ContextBusState {
  /** Current global selection. `{ kind: null }` means nothing is selected. */
  selection: DesktopSelection;
  /** Current global cross-filter, or `null` when no filter is active. */
  crossFilter: CrossFilter;

  /** Replace the global selection. */
  setSelection: (sel: DesktopSelection) => void;
  /** Reset selection back to nothing selected. */
  clearSelection: () => void;
  /** Replace the global cross-filter (pass an object to set, or use clearCrossFilter). */
  setCrossFilter: (f: CrossFilter) => void;
  /** Remove the active cross-filter. */
  clearCrossFilter: () => void;
}

/**
 * Raw store hook. Prefer the focused selectors below in components.
 * Ephemeral: this store is intentionally NOT persisted.
 */
export const useContextBus = create<ContextBusState>()((set) => ({
  selection: EMPTY_SELECTION,
  crossFilter: null,

  setSelection: (selection) => set({ selection }),
  clearSelection: () => set({ selection: EMPTY_SELECTION }),
  setCrossFilter: (crossFilter) => set({ crossFilter }),
  clearCrossFilter: () => set({ crossFilter: null }),
}));

/** Read the current global selection. */
export const useSelection = (): DesktopSelection => useContextBus((s) => s.selection);

/** Read the current global cross-filter. */
export const useCrossFilter = (): CrossFilter => useContextBus((s) => s.crossFilter);

/** Bundle of context-bus actions (stable identities via useShallow). */
export const useContextBusActions = () =>
  useContextBus(
    useShallow((s) => ({
      setSelection: s.setSelection,
      clearSelection: s.clearSelection,
      setCrossFilter: s.setCrossFilter,
      clearCrossFilter: s.clearCrossFilter,
    })),
  );
