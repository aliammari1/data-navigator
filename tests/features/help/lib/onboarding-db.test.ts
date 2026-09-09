/**
 * Unit tests for @/features/help/lib/onboarding-db
 *
 * Strategy: mock `dexie` so no real IndexedDB is opened.
 * The mock exposes a fake Table class with in-memory behaviour
 * so every exported function's logic is exercised for real.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── In-memory table fakes (created via vi.hoisted so they are available
//     before the vi.mock factory runs) ─────────────────────────────────────────

const { fakeFeedbackTable, fakeToursTable, fakeSeenTable, FakeDexie } = vi.hoisted(() => {
  class FakeTable {
    rows: Array<Record<string, unknown>> = [];
    _nextId = 1;
    _primaryKey: string;

    constructor(primaryKey: string) {
      this._primaryKey = primaryKey;
    }

    _reset() {
      this.rows = [];
      this._nextId = 1;
    }

    async add(item: Record<string, unknown>): Promise<number> {
      const id = this._nextId++;
      const row = { ...item, [this._primaryKey]: id };
      this.rows.push(row);
      return id;
    }

    async put(item: Record<string, unknown>): Promise<unknown> {
      const key = item[this._primaryKey];
      const idx = this.rows.findIndex((r) => r[this._primaryKey] === key);
      if (idx >= 0) {
        this.rows[idx] = { ...item };
      } else {
        this.rows.push({ ...item });
      }
      return key;
    }

    async get(key: unknown): Promise<Record<string, unknown> | undefined> {
      return this.rows.find((r) => r[this._primaryKey] === key);
    }

    async delete(key: unknown): Promise<void> {
      this.rows = this.rows.filter((r) => r[this._primaryKey] !== key);
    }

    async clear(): Promise<void> {
      this.rows = [];
    }

    async count(): Promise<number> {
      return this.rows.length;
    }

    // Chaining methods: orderBy -> reverse -> limit -> toArray
    // We return `this` and accumulate transform flags so toArray applies them.
    _reversed = false;
    _limit: number | null = null;
    _orderByField: string | null = null;

    orderBy(field: string): this {
      // Clone-like: work on a snapshot to avoid mutation across chained calls
      this._orderByField = field;
      return this;
    }

    reverse(): this {
      this._reversed = true;
      return this;
    }

    limit(n: number): this {
      this._limit = n;
      return this;
    }

    async toArray(): Promise<Array<Record<string, unknown>>> {
      let result = [...this.rows];
      if (this._orderByField) {
        const field = this._orderByField;
        result = result.sort((a, b) => {
          const av = a[field] as number;
          const bv = b[field] as number;
          return av < bv ? -1 : av > bv ? 1 : 0;
        });
      }
      if (this._reversed) {
        result = result.reverse();
      }
      if (this._limit !== null) {
        result = result.slice(0, this._limit);
      }
      // Reset chain state for next use
      this._reversed = false;
      this._limit = null;
      this._orderByField = null;
      return result;
    }
  }

  const fakeFeedbackTable = new FakeTable("id");
  const fakeToursTable = new FakeTable("tourId");
  const fakeSeenTable = new FakeTable("featureId");

  class FakeDexie {
    feedback = fakeFeedbackTable;
    tours = fakeToursTable;
    seen = fakeSeenTable;

    version(_v: number) {
      return {
        stores: (_schema: Record<string, string>) => {},
      };
    }
  }

  return { fakeFeedbackTable, fakeToursTable, fakeSeenTable, FakeDexie };
});

// Mock dexie before importing the module under test
vi.mock("dexie", () => {
  return {
    default: FakeDexie,
  };
});

// ─── Import the real module after mocking Dexie ───────────────────────────────

import {
  addFeedback,
  countFeedback,
  getAllTourStates,
  getTourState,
  HELP_APP_VERSION,
  hasSeen,
  listFeedback,
  markSeen,
  resetAllTours,
  resetTour,
  saveTourProgress,
} from "@/features/help/lib/onboarding-db";

// ─── Setup: reset tables before each test ────────────────────────────────────

beforeEach(() => {
  fakeFeedbackTable._reset();
  fakeToursTable._reset();
  fakeSeenTable._reset();
});

// =============================================================================
// HELP_APP_VERSION constant
// =============================================================================

describe("HELP_APP_VERSION", () => {
  it("is a non-empty string", () => {
    expect(typeof HELP_APP_VERSION).toBe("string");
    expect(HELP_APP_VERSION.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// addFeedback
// =============================================================================

describe("addFeedback", () => {
  it("returns a number id when a non-empty message is provided", async () => {
    const result = await addFeedback({ message: "Great app!", route: "/dashboard" });
    expect(typeof result).toBe("number");
    expect(result).toBe(1);
  });

  it("returns null when the message is empty", async () => {
    const result = await addFeedback({ message: "", route: "/dashboard" });
    expect(result).toBeNull();
  });

  it("returns null when the message is whitespace only", async () => {
    const result = await addFeedback({ message: "   ", route: "/dashboard" });
    expect(result).toBeNull();
  });

  it("trims the message before persisting", async () => {
    await addFeedback({ message: "  hello  ", route: "/dashboard" });
    const rows = await fakeFeedbackTable.toArray();
    expect(rows[0]?.message).toBe("hello");
  });

  it("stores the route, appVersion and a numeric createdAt", async () => {
    await addFeedback({ message: "test", route: "/home" });
    const rows = await fakeFeedbackTable.toArray();
    const row = rows[0]!;
    expect(row.route).toBe("/home");
    expect(row.appVersion).toBe(HELP_APP_VERSION);
    expect(typeof row.createdAt).toBe("number");
  });

  it("assigns incrementing ids across multiple calls", async () => {
    const id1 = await addFeedback({ message: "first", route: "/" });
    const id2 = await addFeedback({ message: "second", route: "/" });
    expect(id1).toBe(1);
    expect(id2).toBe(2);
  });
});

// =============================================================================
// listFeedback
// =============================================================================

describe("listFeedback", () => {
  it("returns an empty array when no feedback exists", async () => {
    const result = await listFeedback();
    expect(result).toEqual([]);
  });

  it("returns entries when feedback has been added", async () => {
    await addFeedback({ message: "entry one", route: "/a" });
    await addFeedback({ message: "entry two", route: "/b" });
    const result = await listFeedback();
    expect(result.length).toBe(2);
  });

  it("accepts a custom limit parameter", async () => {
    for (let i = 0; i < 5; i++) {
      await addFeedback({ message: `msg ${i}`, route: "/" });
    }
    const result = await listFeedback(3);
    expect(result.length).toBe(3);
  });

  it("uses a default limit of 50 when called with no arguments", async () => {
    for (let i = 0; i < 10; i++) {
      await addFeedback({ message: `msg ${i}`, route: "/" });
    }
    const result = await listFeedback();
    expect(result.length).toBe(10);
  });
});

// =============================================================================
// countFeedback
// =============================================================================

describe("countFeedback", () => {
  it("returns 0 when no feedback exists", async () => {
    const result = await countFeedback();
    expect(result).toBe(0);
  });

  it("returns the correct count after adding entries", async () => {
    await addFeedback({ message: "one", route: "/" });
    await addFeedback({ message: "two", route: "/" });
    const result = await countFeedback();
    expect(result).toBe(2);
  });
});

// =============================================================================
// getTourState
// =============================================================================

describe("getTourState", () => {
  it("returns undefined when no tour state exists for the given id", async () => {
    const result = await getTourState("unknown-tour");
    expect(result).toBeUndefined();
  });

  it("returns the tour state after it has been saved", async () => {
    await saveTourProgress({ tourId: "my-tour", completed: true, stepReached: 3 });
    const result = await getTourState("my-tour");
    expect(result).toBeDefined();
    expect(result?.tourId).toBe("my-tour");
    expect(result?.completed).toBe(true);
    expect(result?.stepReached).toBe(3);
  });
});

// =============================================================================
// getAllTourStates
// =============================================================================

describe("getAllTourStates", () => {
  it("returns an empty Map when no tours have been saved", async () => {
    const result = await getAllTourStates();
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it("returns a Map keyed by tourId after saving tour states", async () => {
    await saveTourProgress({ tourId: "tour-a", completed: false, stepReached: 1 });
    await saveTourProgress({ tourId: "tour-b", completed: true, stepReached: 5 });
    const result = await getAllTourStates();
    expect(result.size).toBe(2);
    expect(result.has("tour-a")).toBe(true);
    expect(result.has("tour-b")).toBe(true);
  });

  it("each entry in the Map matches the saved TourState shape", async () => {
    await saveTourProgress({ tourId: "shape-tour", completed: true, stepReached: 2 });
    const result = await getAllTourStates();
    const state = result.get("shape-tour");
    expect(state?.tourId).toBe("shape-tour");
    expect(state?.completed).toBe(true);
    expect(state?.stepReached).toBe(2);
    expect(typeof state?.updatedAt).toBe("number");
  });
});

// =============================================================================
// saveTourProgress
// =============================================================================

describe("saveTourProgress", () => {
  it("inserts a new tour state", async () => {
    await saveTourProgress({ tourId: "new-tour", completed: false, stepReached: 0 });
    const state = await getTourState("new-tour");
    expect(state).toBeDefined();
    expect(state?.tourId).toBe("new-tour");
  });

  it("updates an existing tour state (upsert)", async () => {
    await saveTourProgress({ tourId: "tour-x", completed: false, stepReached: 1 });
    await saveTourProgress({ tourId: "tour-x", completed: true, stepReached: 4 });
    const state = await getTourState("tour-x");
    expect(state?.completed).toBe(true);
    expect(state?.stepReached).toBe(4);
  });

  it("records a numeric updatedAt timestamp", async () => {
    const before = Date.now();
    await saveTourProgress({ tourId: "timestamp-tour", completed: false, stepReached: 0 });
    const after = Date.now();
    const state = await getTourState("timestamp-tour");
    expect(state?.updatedAt).toBeGreaterThanOrEqual(before);
    expect(state?.updatedAt).toBeLessThanOrEqual(after);
  });
});

// =============================================================================
// resetTour
// =============================================================================

describe("resetTour", () => {
  it("is a no-op when the tour does not exist", async () => {
    await expect(resetTour("nonexistent")).resolves.toBeUndefined();
  });

  it("removes the tour state so getTourState returns undefined", async () => {
    await saveTourProgress({ tourId: "removable-tour", completed: true, stepReached: 2 });
    await resetTour("removable-tour");
    const state = await getTourState("removable-tour");
    expect(state).toBeUndefined();
  });

  it("only removes the specified tour and leaves others intact", async () => {
    await saveTourProgress({ tourId: "keep-tour", completed: false, stepReached: 0 });
    await saveTourProgress({ tourId: "remove-tour", completed: true, stepReached: 1 });
    await resetTour("remove-tour");
    expect(await getTourState("keep-tour")).toBeDefined();
    expect(await getTourState("remove-tour")).toBeUndefined();
  });
});

// =============================================================================
// resetAllTours
// =============================================================================

describe("resetAllTours", () => {
  it("is a no-op when no tours are stored", async () => {
    await expect(resetAllTours()).resolves.toBeUndefined();
  });

  it("removes all tour states", async () => {
    await saveTourProgress({ tourId: "t1", completed: true, stepReached: 1 });
    await saveTourProgress({ tourId: "t2", completed: false, stepReached: 0 });
    await resetAllTours();
    const map = await getAllTourStates();
    expect(map.size).toBe(0);
  });
});

// =============================================================================
// markSeen
// =============================================================================

describe("markSeen", () => {
  it("marks a feature as seen", async () => {
    await markSeen("feature-upload");
    const seen = await hasSeen("feature-upload");
    expect(seen).toBe(true);
  });

  it("is idempotent — calling multiple times does not throw", async () => {
    await markSeen("feature-x");
    await expect(markSeen("feature-x")).resolves.toBeUndefined();
  });

  it("stores a numeric seenAt timestamp", async () => {
    const before = Date.now();
    await markSeen("timestamped-feature");
    const after = Date.now();
    const row = await fakeSeenTable.get("timestamped-feature");
    expect(typeof row?.seenAt).toBe("number");
    expect(row?.seenAt as number).toBeGreaterThanOrEqual(before);
    expect(row?.seenAt as number).toBeLessThanOrEqual(after);
  });
});

// =============================================================================
// hasSeen
// =============================================================================

describe("hasSeen", () => {
  it("returns false for a feature that has never been seen", async () => {
    const result = await hasSeen("never-seen-feature");
    expect(result).toBe(false);
  });

  it("returns true for a feature that has been marked as seen", async () => {
    await markSeen("seen-feature");
    const result = await hasSeen("seen-feature");
    expect(result).toBe(true);
  });

  it("returns false for a different feature even if another was marked seen", async () => {
    await markSeen("feature-a");
    const result = await hasSeen("feature-b");
    expect(result).toBe(false);
  });
});
