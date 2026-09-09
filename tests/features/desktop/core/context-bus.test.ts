import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  useContextBus,
  useContextBusActions,
  useCrossFilter,
  useSelection,
} from "@/features/desktop/core/context-bus";

// ─── Reset store between tests ───────────────────────────────────────────────
// useContextBus is intentionally NOT persisted; we reset only the data fields
// before every test so tests remain isolated. Using the merge form (no replace
// flag) keeps the action functions intact.

const EMPTY_SELECTION = { kind: null } as const;

function resetStore() {
  // Merge-mode reset: only overwrite the two data fields; actions stay in place.
  useContextBus.setState({ selection: EMPTY_SELECTION, crossFilter: null });
}

beforeEach(() => {
  resetStore();
});

// ─── Initial state ────────────────────────────────────────────────────────────

describe("useContextBus — initial state", () => {
  it("starts with an empty selection (kind: null)", () => {
    const state = useContextBus.getState();
    expect(state.selection).toEqual({ kind: null });
  });

  it("starts with a null cross-filter", () => {
    const state = useContextBus.getState();
    expect(state.crossFilter).toBeNull();
  });

  it("exposes the four action functions on the initial state", () => {
    const state = useContextBus.getState();
    expect(typeof state.setSelection).toBe("function");
    expect(typeof state.clearSelection).toBe("function");
    expect(typeof state.setCrossFilter).toBe("function");
    expect(typeof state.clearCrossFilter).toBe("function");
  });
});

// ─── setSelection / clearSelection ───────────────────────────────────────────

describe("setSelection", () => {
  it("replaces the selection with a dataset selection", () => {
    useContextBus.getState().setSelection({ kind: "dataset", id: "ds-1", label: "Sales" });
    expect(useContextBus.getState().selection).toEqual({
      kind: "dataset",
      id: "ds-1",
      label: "Sales",
    });
  });

  it("replaces the selection with a chart selection including meta", () => {
    useContextBus.getState().setSelection({
      kind: "chart",
      id: "chart-42",
      meta: { type: "bar" },
    });
    expect(useContextBus.getState().selection).toEqual({
      kind: "chart",
      id: "chart-42",
      meta: { type: "bar" },
    });
  });

  it("accepts all DesktopSelectionKind values", () => {
    const kinds = ["dataset", "folder", "chart", "kpi", "column", "window"] as const;
    for (const kind of kinds) {
      useContextBus.getState().setSelection({ kind });
      expect(useContextBus.getState().selection.kind).toBe(kind);
    }
  });

  it("accepts a null kind (no-selection object form)", () => {
    useContextBus.getState().setSelection({ kind: "chart" });
    useContextBus.getState().setSelection({ kind: null });
    expect(useContextBus.getState().selection).toEqual({ kind: null });
  });

  it("replaces a previous selection entirely", () => {
    useContextBus.getState().setSelection({ kind: "folder", id: "f1" });
    useContextBus.getState().setSelection({ kind: "kpi", id: "k1" });
    expect(useContextBus.getState().selection).toEqual({ kind: "kpi", id: "k1" });
  });
});

describe("clearSelection", () => {
  it("resets selection to { kind: null } when already empty", () => {
    useContextBus.getState().clearSelection();
    expect(useContextBus.getState().selection).toEqual({ kind: null });
  });

  it("resets a non-empty selection back to the empty sentinel", () => {
    useContextBus.getState().setSelection({ kind: "column", id: "col-5" });
    useContextBus.getState().clearSelection();
    expect(useContextBus.getState().selection).toEqual({ kind: null });
  });

  it("produces an object equal to the initial EMPTY_SELECTION sentinel", () => {
    useContextBus.getState().setSelection({ kind: "window", id: "w1" });
    useContextBus.getState().clearSelection();
    // Must be structurally equal to the module-internal EMPTY_SELECTION constant.
    expect(useContextBus.getState().selection).toEqual(EMPTY_SELECTION);
  });
});

// ─── setCrossFilter / clearCrossFilter ───────────────────────────────────────

describe("setCrossFilter", () => {
  it("sets a dimension/value filter", () => {
    useContextBus.getState().setCrossFilter({ dimension: "channel", value: "SMS" });
    expect(useContextBus.getState().crossFilter).toEqual({
      dimension: "channel",
      value: "SMS",
    });
  });

  it("replaces a previous cross-filter with a new one", () => {
    useContextBus.getState().setCrossFilter({ dimension: "region", value: "North" });
    useContextBus.getState().setCrossFilter({ dimension: "product", value: "Plan-A" });
    expect(useContextBus.getState().crossFilter).toEqual({
      dimension: "product",
      value: "Plan-A",
    });
  });

  it("accepts null to clear the filter directly via setCrossFilter", () => {
    useContextBus.getState().setCrossFilter({ dimension: "d", value: "v" });
    useContextBus.getState().setCrossFilter(null);
    expect(useContextBus.getState().crossFilter).toBeNull();
  });
});

describe("clearCrossFilter", () => {
  it("resets cross-filter to null when already null", () => {
    useContextBus.getState().clearCrossFilter();
    expect(useContextBus.getState().crossFilter).toBeNull();
  });

  it("removes an active cross-filter", () => {
    useContextBus.getState().setCrossFilter({ dimension: "type", value: "USSD" });
    useContextBus.getState().clearCrossFilter();
    expect(useContextBus.getState().crossFilter).toBeNull();
  });
});

// ─── useSelection hook ────────────────────────────────────────────────────────

describe("useSelection hook", () => {
  it("returns the current selection (initially empty)", () => {
    const { result } = renderHook(() => useSelection());
    expect(result.current).toEqual({ kind: null });
  });

  it("reflects updates made via setSelection", () => {
    const { result } = renderHook(() => useSelection());

    act(() => {
      useContextBus.getState().setSelection({ kind: "dataset", id: "ds-99" });
    });

    expect(result.current).toEqual({ kind: "dataset", id: "ds-99" });
  });

  it("reflects clearSelection returning the empty sentinel", () => {
    const { result } = renderHook(() => useSelection());

    act(() => {
      useContextBus.getState().setSelection({ kind: "chart", id: "c-1" });
    });
    act(() => {
      useContextBus.getState().clearSelection();
    });

    expect(result.current).toEqual({ kind: null });
  });
});

// ─── useCrossFilter hook ──────────────────────────────────────────────────────

describe("useCrossFilter hook", () => {
  it("returns null initially (no active filter)", () => {
    const { result } = renderHook(() => useCrossFilter());
    expect(result.current).toBeNull();
  });

  it("reflects a cross-filter set via setCrossFilter", () => {
    const { result } = renderHook(() => useCrossFilter());

    act(() => {
      useContextBus.getState().setCrossFilter({ dimension: "channel", value: "Voice" });
    });

    expect(result.current).toEqual({ dimension: "channel", value: "Voice" });
  });

  it("returns null again after clearCrossFilter", () => {
    const { result } = renderHook(() => useCrossFilter());

    act(() => {
      useContextBus.getState().setCrossFilter({ dimension: "region", value: "South" });
    });
    act(() => {
      useContextBus.getState().clearCrossFilter();
    });

    expect(result.current).toBeNull();
  });
});

// ─── useContextBusActions hook ────────────────────────────────────────────────

describe("useContextBusActions hook", () => {
  it("returns an object with all four action functions", () => {
    const { result } = renderHook(() => useContextBusActions());
    expect(typeof result.current.setSelection).toBe("function");
    expect(typeof result.current.clearSelection).toBe("function");
    expect(typeof result.current.setCrossFilter).toBe("function");
    expect(typeof result.current.clearCrossFilter).toBe("function");
  });

  it("setSelection from actions updates the store", () => {
    const { result } = renderHook(() => useContextBusActions());

    act(() => {
      result.current.setSelection({ kind: "folder", id: "f-10" });
    });

    expect(useContextBus.getState().selection).toEqual({ kind: "folder", id: "f-10" });
  });

  it("clearSelection from actions resets to the empty sentinel", () => {
    const { result } = renderHook(() => useContextBusActions());

    act(() => {
      result.current.setSelection({ kind: "window", id: "w-3" });
    });
    act(() => {
      result.current.clearSelection();
    });

    expect(useContextBus.getState().selection).toEqual({ kind: null });
  });

  it("setCrossFilter from actions updates the store", () => {
    const { result } = renderHook(() => useContextBusActions());

    act(() => {
      result.current.setCrossFilter({ dimension: "type", value: "Data" });
    });

    expect(useContextBus.getState().crossFilter).toEqual({ dimension: "type", value: "Data" });
  });

  it("clearCrossFilter from actions removes the active filter", () => {
    const { result } = renderHook(() => useContextBusActions());

    act(() => {
      result.current.setCrossFilter({ dimension: "type", value: "SMS" });
    });
    act(() => {
      result.current.clearCrossFilter();
    });

    expect(useContextBus.getState().crossFilter).toBeNull();
  });

  it("action references remain stable across store updates (useShallow)", () => {
    const { result, rerender } = renderHook(() => useContextBusActions());
    const firstRef = result.current;

    act(() => {
      useContextBus.getState().setSelection({ kind: "kpi", id: "kpi-1" });
    });

    rerender();

    // The action bundle returned by useShallow must be the same object reference
    // because the action functions themselves did not change.
    expect(result.current.setSelection).toBe(firstRef.setSelection);
    expect(result.current.clearSelection).toBe(firstRef.clearSelection);
    expect(result.current.setCrossFilter).toBe(firstRef.setCrossFilter);
    expect(result.current.clearCrossFilter).toBe(firstRef.clearCrossFilter);
  });
});

// ─── Integration: hooks observe each other's changes ─────────────────────────

describe("integration — concurrent hook subscribers", () => {
  it("useSelection and useContextBusActions observe the same store", () => {
    const selectionHook = renderHook(() => useSelection());
    const actionsHook = renderHook(() => useContextBusActions());

    act(() => {
      actionsHook.result.current.setSelection({ kind: "dataset", id: "shared-1" });
    });

    expect(selectionHook.result.current).toEqual({ kind: "dataset", id: "shared-1" });
  });

  it("useCrossFilter and useContextBusActions observe the same store", () => {
    const filterHook = renderHook(() => useCrossFilter());
    const actionsHook = renderHook(() => useContextBusActions());

    act(() => {
      actionsHook.result.current.setCrossFilter({ dimension: "region", value: "East" });
    });

    expect(filterHook.result.current).toEqual({ dimension: "region", value: "East" });
  });

  it("clearSelection via actions is reflected in useSelection", () => {
    const selectionHook = renderHook(() => useSelection());
    const actionsHook = renderHook(() => useContextBusActions());

    act(() => {
      actionsHook.result.current.setSelection({ kind: "column", id: "c-5" });
    });
    act(() => {
      actionsHook.result.current.clearSelection();
    });

    expect(selectionHook.result.current).toEqual({ kind: null });
  });
});
