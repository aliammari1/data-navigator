import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDashboardHistoryStore } from "@/core/stores/dashboard-history-store";
import { useDesktopStore } from "@/features/desktop/store/desktop-store";

function resetStores() {
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    length: 0,
    key: vi.fn(),
  });
  const { result } = renderHook(() => useDashboardHistoryStore());
  act(() => {
    result.current.clearHistory();
  });
}

beforeEach(() => {
  // Unstub first (a previous test's teardown may have restored the real
  // localStorage), then install a fresh void store so no persisted entries
  // leak between tests through zustand's async rehydration.
  vi.unstubAllGlobals();
  resetStores();
});

describe("dashboard history pin/unpin", () => {
  it("records pinning a formulator widget", () => {
    const { result } = renderHook(() => useDashboardHistoryStore());
    act(() => {
      result.current.doPinFormulatorWidget("w1", "Ventes");
    });
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]).toMatchObject({
      type: "pin-formulator-widget",
      formulatorWidgetId: "w1",
      chartTitle: "Ventes",
    });
  });

  it("records unpinning with a fallback snapshot when no desktop widget exists", () => {
    const { result } = renderHook(() => useDashboardHistoryStore());
    act(() => {
      result.current.doUnpinFormulatorWidget("w9", "Titre");
    });
    expect(result.current.entries[0]).toMatchObject({
      type: "unpin-formulator-widget",
      widgetSnapshot: { widgetType: "pinned-chart", x: 20, y: 20 },
    });
  });

  it("records pinning and removing a KPI widget", () => {
    const { result } = renderHook(() => useDashboardHistoryStore());
    act(() => {
      result.current.doPinWidget("kpi", { metric: "ca" }, 10, 20, "CA");
    });
    expect(result.current.entries[0]).toMatchObject({ type: "pin-kpi-widget" });

    act(() => {
      result.current.doRemoveWidget("x", "kpi", { metric: "ca" }, 10, 20, "CA");
    });
    expect(result.current.entries[0]).toMatchObject({ type: "remove-kpi-widget" });
  });

  it("unpins the formulator widget when removing a pinned-chart", () => {
    const { result } = renderHook(() => useDashboardHistoryStore());
    act(() => {
      result.current.doRemoveWidget("x", "pinned-chart", { formulatorWidgetId: "w1" }, 0, 0, "C");
    });
    expect(result.current.entries[0]).toMatchObject({
      type: "remove-kpi-widget",
      formulatorWidgetId: "w1",
    });
  });
});

describe("dashboard history undo/redo", () => {
  it("undoes a pin by marking it undone and redoes it back", () => {
    const { result } = renderHook(() => useDashboardHistoryStore());
    act(() => {
      result.current.doPinWidget("kpi", { metric: "ca" }, 0, 0, "CA");
    });
    const id = result.current.entries[0].id;

    act(() => {
      result.current.undoEntry(id);
    });
    expect(result.current.undoneIds).toContain(id);

    act(() => {
      result.current.redoEntry(id);
    });
    expect(result.current.undoneIds).not.toContain(id);
  });

  it("ignores undo for unknown ids and double undo", () => {
    const { result } = renderHook(() => useDashboardHistoryStore());
    act(() => {
      result.current.undoEntry("missing");
    });
    expect(result.current.undoneIds).toHaveLength(0);

    act(() => {
      result.current.doPinWidget("kpi", {}, 0, 0, "X");
    });
    const id = result.current.entries[0].id;
    act(() => {
      result.current.undoEntry(id);
      result.current.undoEntry(id);
    });
    expect(result.current.undoneIds).toEqual([id]);
  });

  it("ignores redo for ids that were never undone", () => {
    const { result } = renderHook(() => useDashboardHistoryStore());
    act(() => {
      result.current.doPinWidget("kpi", {}, 0, 0, "X");
    });
    const id = result.current.entries[0].id;
    act(() => {
      result.current.redoEntry(id);
    });
    expect(result.current.undoneIds).toHaveLength(0);
  });

  it("undoes an unpin by restoring from snapshot and redoes it", () => {
    const { result } = renderHook(() => useDashboardHistoryStore());
    act(() => {
      result.current.doUnpinFormulatorWidget("w2", "T");
    });
    const id = result.current.entries[0].id;
    act(() => {
      result.current.undoEntry(id);
    });
    expect(result.current.undoneIds).toContain(id);
    act(() => {
      result.current.redoEntry(id);
    });
    expect(result.current.undoneIds).not.toContain(id);
  });

  it("clears entries and undone ids", () => {
    const { result } = renderHook(() => useDashboardHistoryStore());
    act(() => {
      result.current.doPinWidget("kpi", {}, 0, 0, "X");
    });
    const id = result.current.entries[0].id;
    act(() => {
      result.current.undoEntry(id);
      result.current.clearHistory();
    });
    expect(result.current.entries).toHaveLength(0);
    expect(result.current.undoneIds).toHaveLength(0);
  });
});

describe("dashboard history with a seeded desktop", () => {
  beforeEach(() => {
    act(() => {
      useDesktopStore.getState().addWidget({
        type: "pinned-chart",
        config: { formulatorWidgetId: "w-seeded", title: "Seeded" },
        x: 20,
        y: 20,
      });
    });
  });

  it("unpins against the live desktop widget and undoes the pin", () => {
    const { result } = renderHook(() => useDashboardHistoryStore());
    act(() => {
      result.current.doPinFormulatorWidget("w-seeded", "Seeded");
    });
    const pinId = result.current.entries[0].id;
    act(() => {
      result.current.undoEntry(pinId);
    });
    expect(result.current.undoneIds).toContain(pinId);

    act(() => {
      result.current.doUnpinFormulatorWidget("w-seeded", "Seeded");
    });
    const unpinId = result.current.entries[0].id;
    expect(result.current.entries[0].widgetSnapshot).toMatchObject({
      widgetType: "pinned-chart",
    });
    act(() => {
      result.current.undoEntry(unpinId);
      result.current.redoEntry(pinId);
    });
    expect(result.current.undoneIds).not.toContain(pinId);
  });

  it("restores a removed KPI widget with its snapshot on undo", () => {
    const { result } = renderHook(() => useDashboardHistoryStore());
    act(() => {
      result.current.doRemoveWidget("ghost", "kpi", { metric: "m" }, 5, 5, "M");
    });
    const id = result.current.entries[0].id;
    act(() => {
      result.current.undoEntry(id);
    });
    expect(result.current.undoneIds).toContain(id);
    expect(useDesktopStore.getState().widgets.some((w) => w.type === "kpi")).toBe(true);
  });

  it("redoes a remove by dropping the restored widget again", () => {
    const { result } = renderHook(() => useDashboardHistoryStore());
    act(() => {
      result.current.doPinWidget("kpi", { metric: "r" }, 1, 1, "R");
    });
    const pinId = result.current.entries[0].id;
    act(() => {
      result.current.undoEntry(pinId);
      result.current.redoEntry(pinId);
    });
    expect(result.current.undoneIds).toHaveLength(0);
  });
});
