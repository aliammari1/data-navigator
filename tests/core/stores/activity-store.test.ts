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
  type ActivityType,
  useActivityActions,
  useActivityEvents,
  useActivityStore,
} from "@/core/stores/activity-store";

const MAX_ACTIVITY_EVENTS = 500;

/** Reset to an empty event log between tests for full isolation. */
function resetStore() {
  act(() => {
    useActivityStore.setState({ events: [] });
  });
}

describe("useActivityStore", () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe("defaults", () => {
    it("starts with an empty event log", () => {
      expect(useActivityStore.getState().events).toEqual([]);
    });
  });

  describe("addEvent", () => {
    it("stores the provided event fields verbatim", () => {
      // Act
      act(() => {
        useActivityStore.getState().addEvent({
          type: "dataset_uploaded",
          message: "Uploaded sales.csv",
          datasetId: "ds-1",
          tableName: "sales",
          metadata: { rows: 1000 },
        });
      });

      // Assert
      const [event] = useActivityStore.getState().events;
      expect(event.type).toBe("dataset_uploaded");
      expect(event.message).toBe("Uploaded sales.csv");
      expect(event.datasetId).toBe("ds-1");
      expect(event.tableName).toBe("sales");
      expect(event.metadata).toEqual({ rows: 1000 });
    });

    it("generates an id and an ISO createdAt timestamp", () => {
      // Arrange: freeze time so the timestamp is deterministic.
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-16T12:00:00.000Z"));

      // Act
      act(() => {
        useActivityStore.getState().addEvent({
          type: "query_run",
          message: "ran a query",
        });
      });

      // Assert
      const [event] = useActivityStore.getState().events;
      expect(event.id).toMatch(/^evt_/);
      expect(event.createdAt).toBe("2026-06-16T12:00:00.000Z");
    });

    it("prepends new events so the newest is first (most-recent ordering)", () => {
      // Act
      act(() => {
        useActivityStore.getState().addEvent({ type: "query_run", message: "first" });
      });
      act(() => {
        useActivityStore.getState().addEvent({ type: "query_run", message: "second" });
      });
      act(() => {
        useActivityStore.getState().addEvent({ type: "query_run", message: "third" });
      });

      // Assert
      const messages = useActivityStore.getState().events.map((e) => e.message);
      expect(messages).toEqual(["third", "second", "first"]);
    });

    it("produces distinct ids across rapid successive calls", () => {
      // Act
      act(() => {
        for (let i = 0; i < 20; i += 1) {
          useActivityStore.getState().addEvent({ type: "transform_run", message: `t${i}` });
        }
      });

      // Assert
      const ids = useActivityStore.getState().events.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("omits optional fields that were not supplied", () => {
      // Act
      act(() => {
        useActivityStore.getState().addEvent({
          type: "telecom_opened",
          message: "opened report",
        });
      });

      // Assert
      const [event] = useActivityStore.getState().events;
      expect(event.datasetId).toBeUndefined();
      expect(event.tableName).toBeUndefined();
      expect(event.metadata).toBeUndefined();
    });
  });

  describe("ring buffer cap", () => {
    it("caps the log at MAX_ACTIVITY_EVENTS, dropping the oldest entries", () => {
      // Act: push more than the cap.
      act(() => {
        for (let i = 0; i < MAX_ACTIVITY_EVENTS + 50; i += 1) {
          useActivityStore.getState().addEvent({ type: "query_run", message: `q${i}` });
        }
      });

      // Assert: length is capped and the newest (last pushed) survives at the head.
      const { events } = useActivityStore.getState();
      expect(events).toHaveLength(MAX_ACTIVITY_EVENTS);
      expect(events[0].message).toBe(`q${MAX_ACTIVITY_EVENTS + 49}`);
      // The oldest entries (q0..q49) were evicted.
      expect(events.some((e) => e.message === "q0")).toBe(false);
      expect(events.some((e) => e.message === "q49")).toBe(false);
      // The oldest surviving entry is q50.
      expect(events[events.length - 1].message).toBe("q50");
    });

    it("keeps exactly MAX_ACTIVITY_EVENTS when pushing exactly the cap", () => {
      act(() => {
        for (let i = 0; i < MAX_ACTIVITY_EVENTS; i += 1) {
          useActivityStore.getState().addEvent({ type: "query_run", message: `q${i}` });
        }
      });
      expect(useActivityStore.getState().events).toHaveLength(MAX_ACTIVITY_EVENTS);
    });
  });

  describe("clearEvents", () => {
    it("empties a populated log", () => {
      // Arrange
      act(() => {
        useActivityStore.getState().addEvent({ type: "query_run", message: "x" });
        useActivityStore.getState().addEvent({ type: "query_run", message: "y" });
      });
      expect(useActivityStore.getState().events.length).toBeGreaterThan(0);

      // Act
      act(() => {
        useActivityStore.getState().clearEvents();
      });

      // Assert
      expect(useActivityStore.getState().events).toEqual([]);
    });

    it("is safe to call on an already-empty log", () => {
      act(() => {
        useActivityStore.getState().clearEvents();
      });
      expect(useActivityStore.getState().events).toEqual([]);
    });
  });

  describe("immutability", () => {
    it("does not mutate the previous events array reference on addEvent", () => {
      // Arrange
      act(() => {
        useActivityStore.getState().addEvent({ type: "query_run", message: "a" });
      });
      const before = useActivityStore.getState().events;

      // Act
      act(() => {
        useActivityStore.getState().addEvent({ type: "query_run", message: "b" });
      });
      const after = useActivityStore.getState().events;

      // Assert: a fresh array was produced (new reference, longer length).
      expect(after).not.toBe(before);
      expect(before).toHaveLength(1);
      expect(after).toHaveLength(2);
    });
  });

  describe("selector hooks", () => {
    it("useActivityEvents reflects the current log", () => {
      // Arrange
      act(() => {
        useActivityStore.getState().addEvent({ type: "telecom_analysis_saved", message: "saved" });
      });

      // Act
      const { result } = renderHook(() => useActivityEvents());

      // Assert
      expect(result.current).toHaveLength(1);
      expect(result.current[0].message).toBe("saved");
    });

    it("useActivityActions exposes working add/clear actions", () => {
      // Arrange
      const { result } = renderHook(() => useActivityActions());

      // Act
      act(() => {
        result.current.addEvent({ type: "dataset_selected", message: "selected" });
      });

      // Assert
      expect(useActivityStore.getState().events[0].message).toBe("selected");

      // Act
      act(() => {
        result.current.clearEvents();
      });

      // Assert
      expect(useActivityStore.getState().events).toEqual([]);
    });
  });

  describe("activity types", () => {
    it("accepts every known activity type", () => {
      const types: ActivityType[] = [
        "dataset_uploaded",
        "dataset_selected",
        "telecom_opened",
        "telecom_analysis_saved",
        "transform_run",
        "query_run",
      ];

      act(() => {
        for (const type of types) {
          useActivityStore.getState().addEvent({ type, message: type });
        }
      });

      const storedTypes = useActivityStore
        .getState()
        .events.map((e) => e.type)
        .sort();
      expect(storedTypes).toEqual([...types].sort());
    });
  });

  describe("persist: migrate function", () => {
    // Access the migrate function through the zustand persist API.
    // The store exposes `store.persist.getOptions()` at runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getMigrate = () => (useActivityStore as any).persist.getOptions().migrate as (persisted: unknown, version: number) => { events: unknown[] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getPartialize = () => (useActivityStore as any).persist.getOptions().partialize as (s: { events: unknown[] }) => { events: unknown[] };

    it("migrate: returns empty events array when persisted is null", () => {
      const migrate = getMigrate();
      const result = migrate(null, 0);
      expect(result).toEqual({ events: [] });
    });

    it("migrate: returns empty events array when persisted is undefined", () => {
      const migrate = getMigrate();
      const result = migrate(undefined, 0);
      expect(result).toEqual({ events: [] });
    });

    it("migrate: returns empty events array when prev.events is not an array", () => {
      const migrate = getMigrate();
      const result = migrate({ events: "not-an-array" }, 0);
      expect(result).toEqual({ events: [] });
    });

    it("migrate: returns empty events array when prev.events is missing", () => {
      const migrate = getMigrate();
      const result = migrate({}, 0);
      expect(result).toEqual({ events: [] });
    });

    it("migrate: filters out events with unknown types", () => {
      const migrate = getMigrate();
      const input = {
        events: [
          { id: "1", type: "dataset_uploaded", message: "ok", createdAt: "2026-01-01T00:00:00.000Z" },
          { id: "2", type: "unknown_type", message: "bad", createdAt: "2026-01-01T00:00:00.000Z" },
          { id: "3", type: "query_run", message: "ok2", createdAt: "2026-01-01T00:00:00.000Z" },
        ],
      };
      const result = migrate(input, 0);
      expect(result.events).toHaveLength(2);
      expect((result.events as Array<{ type: string }>).map((e) => e.type)).toEqual([
        "dataset_uploaded",
        "query_run",
      ]);
    });

    it("migrate: filters out null/falsy event entries", () => {
      const migrate = getMigrate();
      const input = {
        events: [
          null,
          undefined,
          { id: "1", type: "dataset_uploaded", message: "ok", createdAt: "2026-01-01T00:00:00.000Z" },
        ],
      };
      const result = migrate(input, 0);
      expect(result.events).toHaveLength(1);
    });

    it("migrate: caps result at MAX_ACTIVITY_EVENTS (500)", () => {
      const migrate = getMigrate();
      const manyEvents = Array.from({ length: 600 }, (_, i) => ({
        id: `id-${i}`,
        type: "query_run" as ActivityType,
        message: `q${i}`,
        createdAt: "2026-01-01T00:00:00.000Z",
      }));
      const result = migrate({ events: manyEvents }, 0);
      expect(result.events).toHaveLength(500);
    });

    it("migrate: keeps all events when count is below the cap", () => {
      const migrate = getMigrate();
      const events = [
        { id: "1", type: "dataset_selected", message: "a", createdAt: "2026-01-01T00:00:00.000Z" },
        { id: "2", type: "transform_run", message: "b", createdAt: "2026-01-01T00:00:00.000Z" },
      ];
      const result = migrate({ events }, 0);
      expect(result.events).toHaveLength(2);
    });

    it("partialize: returns only the events slice of state", () => {
      const partialize = getPartialize();
      const fakeState = {
        events: [{ id: "1", type: "query_run" as ActivityType, message: "x", createdAt: "2026-01-01T00:00:00.000Z" }],
        addEvent: () => {},
        clearEvents: () => {},
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = partialize(fakeState as any);
      expect(result).toEqual({ events: fakeState.events });
      expect(result).not.toHaveProperty("addEvent");
      expect(result).not.toHaveProperty("clearEvents");
    });
  });
});
