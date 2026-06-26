import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the persistence boundary so store writes never touch fetch / SQLite.
vi.mock("@/platform/settings/settings-client", () => ({
  canUseSettingsApi: () => false,
  getAppSettingRemote: vi.fn(async () => ({ value: null, updatedAt: null })),
  putAppSettingRemote: vi.fn(async () => null),
  deleteAppSettingRemote: vi.fn(async () => undefined),
  exportAppSettingsRemote: vi.fn(async () => ({})),
}));

import {
  useReportDraftActions,
  useReportDraftCount,
  useReportDraftItems,
  useReportDraftStore,
} from "@/core/stores/report-draft-store";

const MAX_DRAFT_ITEMS = 200;

/** Reset to empty items between tests for full isolation. */
function resetStore() {
  act(() => {
    useReportDraftStore.setState({ items: [] });
  });
}

const baseItem = {
  kind: "insight" as const,
  title: "Test Insight",
  source: "ai-analysis",
};

describe("useReportDraftStore", () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Initial state
  // ─────────────────────────────────────────────────────────────────────────
  describe("initial state", () => {
    it("starts with an empty items list", () => {
      expect(useReportDraftStore.getState().items).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // addItem
  // ─────────────────────────────────────────────────────────────────────────
  describe("addItem", () => {
    it("adds an item with auto-generated id and createdAt", () => {
      // Arrange
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-25T10:00:00.000Z"));

      // Act
      act(() => {
        useReportDraftStore.getState().addItem(baseItem);
      });

      // Assert
      const [item] = useReportDraftStore.getState().items;
      expect(item.id).toMatch(/^draft_/);
      expect(item.createdAt).toBe("2026-06-25T10:00:00.000Z");
      expect(item.kind).toBe("insight");
      expect(item.title).toBe("Test Insight");
      expect(item.source).toBe("ai-analysis");
    });

    it("prepends new items so the newest is first", () => {
      // Act
      act(() => {
        useReportDraftStore.getState().addItem({ ...baseItem, title: "First" });
      });
      act(() => {
        useReportDraftStore.getState().addItem({ ...baseItem, title: "Second" });
      });
      act(() => {
        useReportDraftStore.getState().addItem({ ...baseItem, title: "Third" });
      });

      // Assert
      const titles = useReportDraftStore.getState().items.map((i) => i.title);
      expect(titles).toEqual(["Third", "Second", "First"]);
    });

    it("generates distinct ids for rapid successive calls", () => {
      // Act
      act(() => {
        for (let i = 0; i < 20; i++) {
          useReportDraftStore.getState().addItem({ ...baseItem, title: `item-${i}` });
        }
      });

      // Assert
      const ids = useReportDraftStore.getState().items.map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("stores all optional fields when supplied", () => {
      // Act
      act(() => {
        useReportDraftStore.getState().addItem({
          kind: "chart",
          title: "Revenue Chart",
          summary: "Monthly revenue breakdown",
          source: "deep-analytics",
          datasetId: "ds-abc",
          payload: { type: "bar", data: [1, 2, 3] },
        });
      });

      // Assert
      const [item] = useReportDraftStore.getState().items;
      expect(item.kind).toBe("chart");
      expect(item.summary).toBe("Monthly revenue breakdown");
      expect(item.datasetId).toBe("ds-abc");
      expect(item.payload).toEqual({ type: "bar", data: [1, 2, 3] });
    });

    it("stores item without optional fields (undefined for summary, datasetId, payload)", () => {
      // Act
      act(() => {
        useReportDraftStore.getState().addItem({
          kind: "note",
          title: "Plain note",
          source: "briefing",
        });
      });

      // Assert
      const [item] = useReportDraftStore.getState().items;
      expect(item.summary).toBeUndefined();
      expect(item.datasetId).toBeUndefined();
      expect(item.payload).toBeUndefined();
    });

    it("supports all ReportDraftKind values", () => {
      const kinds = ["insight", "chart", "kpi", "table", "note"] as const;

      act(() => {
        for (const kind of kinds) {
          useReportDraftStore.getState().addItem({ kind, title: kind, source: "test" });
        }
      });

      const storedKinds = useReportDraftStore
        .getState()
        .items.map((i) => i.kind)
        .sort();
      expect(storedKinds).toEqual([...kinds].sort());
    });

    it("caps items at MAX_DRAFT_ITEMS, dropping the oldest", () => {
      // Act: push more than the cap
      act(() => {
        for (let i = 0; i < MAX_DRAFT_ITEMS + 50; i++) {
          useReportDraftStore.getState().addItem({ ...baseItem, title: `item-${i}` });
        }
      });

      // Assert
      const { items } = useReportDraftStore.getState();
      expect(items).toHaveLength(MAX_DRAFT_ITEMS);
      // Newest is at head
      expect(items[0].title).toBe(`item-${MAX_DRAFT_ITEMS + 49}`);
      // Oldest entries were evicted
      expect(items.some((i) => i.title === "item-0")).toBe(false);
    });

    it("keeps exactly MAX_DRAFT_ITEMS when pushing exactly the cap", () => {
      act(() => {
        for (let i = 0; i < MAX_DRAFT_ITEMS; i++) {
          useReportDraftStore.getState().addItem({ ...baseItem, title: `item-${i}` });
        }
      });
      expect(useReportDraftStore.getState().items).toHaveLength(MAX_DRAFT_ITEMS);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // removeItem
  // ─────────────────────────────────────────────────────────────────────────
  describe("removeItem", () => {
    it("removes the item with the matching id", () => {
      // Arrange
      act(() => {
        useReportDraftStore.getState().addItem({ ...baseItem, title: "Keep" });
        useReportDraftStore.getState().addItem({ ...baseItem, title: "Remove" });
      });

      const idToRemove = useReportDraftStore.getState().items[0].id; // newest = "Remove"

      // Act
      act(() => {
        useReportDraftStore.getState().removeItem(idToRemove);
      });

      // Assert
      const { items } = useReportDraftStore.getState();
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe("Keep");
    });

    it("is a no-op for a non-existent id", () => {
      // Arrange
      act(() => {
        useReportDraftStore.getState().addItem(baseItem);
      });
      const before = useReportDraftStore.getState().items.length;

      // Act
      act(() => {
        useReportDraftStore.getState().removeItem("nonexistent-id");
      });

      // Assert
      expect(useReportDraftStore.getState().items).toHaveLength(before);
    });

    it("is safe to call on an empty store", () => {
      act(() => {
        useReportDraftStore.getState().removeItem("any-id");
      });
      expect(useReportDraftStore.getState().items).toEqual([]);
    });

    it("does not mutate the array reference from the previous state", () => {
      // Arrange
      act(() => {
        useReportDraftStore.getState().addItem({ ...baseItem, title: "A" });
        useReportDraftStore.getState().addItem({ ...baseItem, title: "B" });
      });
      const before = useReportDraftStore.getState().items;
      const idToRemove = before[0].id;

      // Act
      act(() => {
        useReportDraftStore.getState().removeItem(idToRemove);
      });
      const after = useReportDraftStore.getState().items;

      // Assert: new array reference
      expect(after).not.toBe(before);
      expect(before).toHaveLength(2);
      expect(after).toHaveLength(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // clear
  // ─────────────────────────────────────────────────────────────────────────
  describe("clear", () => {
    it("empties a populated items list", () => {
      // Arrange
      act(() => {
        useReportDraftStore.getState().addItem(baseItem);
        useReportDraftStore.getState().addItem({ ...baseItem, title: "Another" });
      });
      expect(useReportDraftStore.getState().items.length).toBeGreaterThan(0);

      // Act
      act(() => {
        useReportDraftStore.getState().clear();
      });

      // Assert
      expect(useReportDraftStore.getState().items).toEqual([]);
    });

    it("is safe to call on an already-empty store", () => {
      act(() => {
        useReportDraftStore.getState().clear();
      });
      expect(useReportDraftStore.getState().items).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Selector hooks
  // ─────────────────────────────────────────────────────────────────────────
  describe("selector hooks", () => {
    describe("useReportDraftItems", () => {
      it("returns the current items list", () => {
        // Arrange
        act(() => {
          useReportDraftStore.getState().addItem({ ...baseItem, title: "Hook Item" });
        });

        // Act
        const { result } = renderHook(() => useReportDraftItems());

        // Assert
        expect(result.current).toHaveLength(1);
        expect(result.current[0].title).toBe("Hook Item");
      });

      it("returns an empty array when the store is empty", () => {
        const { result } = renderHook(() => useReportDraftItems());
        expect(result.current).toEqual([]);
      });
    });

    describe("useReportDraftCount", () => {
      it("returns 0 when the store is empty", () => {
        const { result } = renderHook(() => useReportDraftCount());
        expect(result.current).toBe(0);
      });

      it("returns the number of items currently in the store", () => {
        // Arrange
        act(() => {
          useReportDraftStore.getState().addItem(baseItem);
          useReportDraftStore.getState().addItem(baseItem);
          useReportDraftStore.getState().addItem(baseItem);
        });

        // Act
        const { result } = renderHook(() => useReportDraftCount());

        // Assert
        expect(result.current).toBe(3);
      });

      it("updates reactively when items are added", () => {
        const { result } = renderHook(() => useReportDraftCount());
        expect(result.current).toBe(0);

        act(() => {
          useReportDraftStore.getState().addItem(baseItem);
        });

        expect(result.current).toBe(1);
      });
    });

    describe("useReportDraftActions", () => {
      it("exposes addItem, removeItem, and clear actions", () => {
        const { result } = renderHook(() => useReportDraftActions());

        expect(typeof result.current.addItem).toBe("function");
        expect(typeof result.current.removeItem).toBe("function");
        expect(typeof result.current.clear).toBe("function");
      });

      it("addItem via hook adds to the store", () => {
        const { result } = renderHook(() => useReportDraftActions());

        act(() => {
          result.current.addItem({ kind: "kpi", title: "KPI via hook", source: "forecast" });
        });

        expect(useReportDraftStore.getState().items[0].title).toBe("KPI via hook");
      });

      it("removeItem via hook removes from the store", () => {
        // Arrange
        act(() => {
          useReportDraftStore.getState().addItem({ ...baseItem, title: "To remove" });
        });
        const id = useReportDraftStore.getState().items[0].id;

        // Act
        const { result } = renderHook(() => useReportDraftActions());
        act(() => {
          result.current.removeItem(id);
        });

        // Assert
        expect(useReportDraftStore.getState().items).toEqual([]);
      });

      it("clear via hook empties the store", () => {
        // Arrange
        act(() => {
          useReportDraftStore.getState().addItem(baseItem);
          useReportDraftStore.getState().addItem(baseItem);
        });

        // Act
        const { result } = renderHook(() => useReportDraftActions());
        act(() => {
          result.current.clear();
        });

        // Assert
        expect(useReportDraftStore.getState().items).toEqual([]);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Immutability
  // ─────────────────────────────────────────────────────────────────────────
  describe("immutability", () => {
    it("does not mutate the previous items array reference on addItem", () => {
      // Arrange
      act(() => {
        useReportDraftStore.getState().addItem(baseItem);
      });
      const before = useReportDraftStore.getState().items;

      // Act
      act(() => {
        useReportDraftStore.getState().addItem({ ...baseItem, title: "New" });
      });
      const after = useReportDraftStore.getState().items;

      // Assert
      expect(after).not.toBe(before);
      expect(before).toHaveLength(1);
      expect(after).toHaveLength(2);
    });
  });
});
