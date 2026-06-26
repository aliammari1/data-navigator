import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mirrorStoreToDexie,
  runOnceBackfill,
} from "@/platform/storage/store-mirror";
import type { SubscribableStore } from "@/platform/storage/store-mirror";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal in-memory zustand-like store for testing. */
function makeStore<T>(initial: T): SubscribableStore<T> & { setState: (s: T) => void } {
  let state = initial;
  const listeners: Array<(state: T, prev: T) => void> = [];
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.push(listener);
      return () => {
        const idx = listeners.indexOf(listener);
        if (idx !== -1) listeners.splice(idx, 1);
      };
    },
    setState(next: T) {
      const prev = state;
      state = next;
      for (const l of listeners) l(next, prev);
    },
  };
}

/** Build a mock Dexie-like DB with a `_backfill` table. */
function makeMockDb(tableData: Map<string, { key: string; version: number; ranAt: number }> = new Map()) {
  const tableMock = {
    get: vi.fn(async (key: string) => tableData.get(key) ?? undefined),
    put: vi.fn(async (row: { key: string; version: number; ranAt: number }) => {
      tableData.set(row.key, row);
    }),
  };
  return {
    table: vi.fn(() => tableMock),
    _tableData: tableData,
    _tableMock: tableMock,
  };
}

// ---------------------------------------------------------------------------
// mirrorStoreToDexie
// ---------------------------------------------------------------------------

describe("mirrorStoreToDexie", () => {
  it("fires onChange immediately with the current state and undefined as previous", () => {
    // Arrange
    const store = makeStore({ count: 5 });
    const onChange = vi.fn();

    // Act
    const stop = mirrorStoreToDexie(store, (s) => s.count, onChange);

    // Assert: called once immediately with initial value
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(5, undefined);

    stop();
  });

  it("fires onChange when the selected slice changes", () => {
    // Arrange
    const store = makeStore({ count: 0 });
    const onChange = vi.fn();
    const stop = mirrorStoreToDexie(store, (s) => s.count, onChange);
    onChange.mockClear();

    // Act
    store.setState({ count: 1 });

    // Assert
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(1, 0);

    stop();
  });

  it("does NOT fire onChange when the selected slice value is the same (referential equality)", () => {
    // Arrange
    const store = makeStore({ a: 1, b: 2 });
    const onChange = vi.fn();
    const stop = mirrorStoreToDexie(store, (s) => s.a, onChange);
    onChange.mockClear();

    // Act — change b, not a
    store.setState({ a: 1, b: 99 });

    // Assert — a is still 1, onChange must NOT be called
    expect(onChange).not.toHaveBeenCalled();

    stop();
  });

  it("correctly passes 'previous' as the value before the change (not undefined)", () => {
    // Arrange
    const store = makeStore({ val: "first" });
    const onChange = vi.fn();
    const stop = mirrorStoreToDexie(store, (s) => s.val, onChange);
    onChange.mockClear();

    // Act
    store.setState({ val: "second" });
    store.setState({ val: "third" });

    // Assert
    expect(onChange).toHaveBeenNthCalledWith(1, "second", "first");
    expect(onChange).toHaveBeenNthCalledWith(2, "third", "second");

    stop();
  });

  it("stops receiving updates after the returned unsubscribe is called", () => {
    // Arrange
    const store = makeStore({ x: 0 });
    const onChange = vi.fn();
    const stop = mirrorStoreToDexie(store, (s) => s.x, onChange);
    onChange.mockClear();

    // Act
    stop();
    store.setState({ x: 1 });

    // Assert — no calls after unsubscribe
    expect(onChange).not.toHaveBeenCalled();
  });

  it("uses a custom equals comparator when provided", () => {
    // Arrange: shallow compare on name property
    interface Named { name: string; ts: number }
    const store = makeStore<Named>({ name: "alice", ts: 1 });
    const onChange = vi.fn();
    // Custom equals: only compare by name
    const byName = (a: Named, b: Named) => a.name === b.name;
    const stop = mirrorStoreToDexie(store, (s) => s, onChange, byName);
    onChange.mockClear();

    // Act — same name, different ts → should NOT trigger
    store.setState({ name: "alice", ts: 2 });
    expect(onChange).not.toHaveBeenCalled();

    // Act — different name → SHOULD trigger
    store.setState({ name: "bob", ts: 2 });
    expect(onChange).toHaveBeenCalledTimes(1);

    stop();
  });

  it("handles multiple successive state changes in order", () => {
    // Arrange
    const store = makeStore({ n: 0 });
    const results: number[] = [];
    const stop = mirrorStoreToDexie(store, (s) => s.n, (v) => results.push(v));

    // Act
    store.setState({ n: 1 });
    store.setState({ n: 2 });
    store.setState({ n: 3 });

    // Assert — first call is initial (0), then 1, 2, 3
    expect(results).toEqual([0, 1, 2, 3]);
    stop();
  });

  it("selector can return any derived value, not just a direct property", () => {
    // Arrange
    const store = makeStore({ items: ["a", "b"] });
    const onChange = vi.fn();
    const stop = mirrorStoreToDexie(store, (s) => s.items.length, onChange);
    onChange.mockClear();

    // Act — same length, no trigger
    store.setState({ items: ["x", "y"] });
    expect(onChange).not.toHaveBeenCalled();

    // Act — different length, trigger
    store.setState({ items: ["x", "y", "z"] });
    expect(onChange).toHaveBeenCalledWith(3, 2);

    stop();
  });
});

// ---------------------------------------------------------------------------
// runOnceBackfill — with Dexie _backfill table
// ---------------------------------------------------------------------------

describe("runOnceBackfill (with _backfill table)", () => {
  it("runs work and inserts a guard row when no prior record exists", async () => {
    // Arrange
    const db = makeMockDb();
    const work = vi.fn().mockResolvedValue(undefined);

    // Act
    const ran = await runOnceBackfill(db, "migration:1", 1, work);

    // Assert
    expect(ran).toBe(true);
    expect(work).toHaveBeenCalledTimes(1);
    expect(db._tableMock.put).toHaveBeenCalledWith(
      expect.objectContaining({ key: "migration:1", version: 1 }),
    );
  });

  it("skips work when a guard row with the same version already exists", async () => {
    // Arrange — pre-populate guard with version 1
    const existing = new Map([["my-key", { key: "my-key", version: 1, ranAt: 1000 }]]);
    const db = makeMockDb(existing);
    const work = vi.fn().mockResolvedValue(undefined);

    // Act
    const ran = await runOnceBackfill(db, "my-key", 1, work);

    // Assert
    expect(ran).toBe(false);
    expect(work).not.toHaveBeenCalled();
  });

  it("skips work when guard row version is higher than requested", async () => {
    // Arrange — guard row at version 5
    const existing = new Map([["old-key", { key: "old-key", version: 5, ranAt: 2000 }]]);
    const db = makeMockDb(existing);
    const work = vi.fn().mockResolvedValue(undefined);

    // Act
    const ran = await runOnceBackfill(db, "old-key", 3, work);

    // Assert
    expect(ran).toBe(false);
    expect(work).not.toHaveBeenCalled();
  });

  it("re-runs work when bumping the version number beyond the stored one", async () => {
    // Arrange — stored at version 1, caller requests version 2
    const existing = new Map([["key-a", { key: "key-a", version: 1, ranAt: 100 }]]);
    const db = makeMockDb(existing);
    const work = vi.fn().mockResolvedValue(undefined);

    // Act
    const ran = await runOnceBackfill(db, "key-a", 2, work);

    // Assert
    expect(ran).toBe(true);
    expect(work).toHaveBeenCalledTimes(1);
    expect(db._tableMock.put).toHaveBeenCalledWith(
      expect.objectContaining({ key: "key-a", version: 2 }),
    );
  });

  it("records the ranAt timestamp at approximately the time of the call", async () => {
    // Arrange
    const before = Date.now();
    const db = makeMockDb();
    const work = vi.fn().mockResolvedValue(undefined);

    // Act
    await runOnceBackfill(db, "ts-test", 1, work);
    const after = Date.now();

    // Assert
    const putArg = db._tableMock.put.mock.calls[0][0] as { ranAt: number };
    expect(putArg.ranAt).toBeGreaterThanOrEqual(before);
    expect(putArg.ranAt).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// runOnceBackfill — fallback to localStorage when table() throws
// ---------------------------------------------------------------------------

describe("runOnceBackfill (localStorage fallback)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  /** A DB whose table() always throws, triggering the localStorage fallback. */
  function makeNoTableDb() {
    return {
      table: vi.fn(() => {
        throw new Error("Schema has no _backfill table");
      }),
    };
  }

  it("runs work and writes a guard to localStorage when no _backfill table exists", async () => {
    // Arrange
    const db = makeNoTableDb();
    const work = vi.fn().mockResolvedValue(undefined);

    // Act
    const ran = await runOnceBackfill(db, "ls-key", 1, work);

    // Assert
    expect(ran).toBe(true);
    expect(work).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem("dn:backfill:ls-key")).toBe("1");
  });

  it("skips work when localStorage already has the guard at the same version", async () => {
    // Arrange — pre-set guard
    window.localStorage.setItem("dn:backfill:ls-key2", "2");
    const db = makeNoTableDb();
    const work = vi.fn().mockResolvedValue(undefined);

    // Act
    const ran = await runOnceBackfill(db, "ls-key2", 2, work);

    // Assert
    expect(ran).toBe(false);
    expect(work).not.toHaveBeenCalled();
  });

  it("skips work when localStorage guard version is higher than requested", async () => {
    // Arrange — guard at version 10
    window.localStorage.setItem("dn:backfill:ls-key3", "10");
    const db = makeNoTableDb();
    const work = vi.fn().mockResolvedValue(undefined);

    // Act
    const ran = await runOnceBackfill(db, "ls-key3", 5, work);

    // Assert
    expect(ran).toBe(false);
    expect(work).not.toHaveBeenCalled();
  });

  it("re-runs work when localStorage version is below the requested version", async () => {
    // Arrange — guard at version 1, bump to 2
    window.localStorage.setItem("dn:backfill:upgrade-key", "1");
    const db = makeNoTableDb();
    const work = vi.fn().mockResolvedValue(undefined);

    // Act
    const ran = await runOnceBackfill(db, "upgrade-key", 2, work);

    // Assert
    expect(ran).toBe(true);
    expect(work).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem("dn:backfill:upgrade-key")).toBe("2");
  });

  it("treats a non-numeric localStorage guard as 'not done' and re-runs work", async () => {
    // Arrange — corrupted guard value
    window.localStorage.setItem("dn:backfill:corrupt-key", "not-a-number");
    const db = makeNoTableDb();
    const work = vi.fn().mockResolvedValue(undefined);

    // Act
    const ran = await runOnceBackfill(db, "corrupt-key", 1, work);

    // Assert — Number("not-a-number") is NaN, >= 1 is false, so runs
    expect(ran).toBe(true);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("handles localStorage.getItem throwing (e.g. private browsing quota) gracefully", async () => {
    // Arrange — stub getItem to throw
    const origGet = window.localStorage.getItem.bind(window.localStorage);
    vi.spyOn(window.localStorage, "getItem").mockImplementationOnce(() => {
      throw new Error("SecurityError");
    });
    const db = makeNoTableDb();
    const work = vi.fn().mockResolvedValue(undefined);

    // Act — should not throw
    const ran = await runOnceBackfill(db, "error-key", 1, work);

    // Assert — falls through catch → done=false → runs work
    expect(ran).toBe(true);
    expect(work).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
    void origGet; // keep reference
  });

  it("handles localStorage.setItem throwing after work completes — still returns true", async () => {
    // Arrange — setItem throws on write
    vi.spyOn(window.localStorage, "setItem").mockImplementationOnce(() => {
      throw new Error("QuotaExceededError");
    });
    const db = makeNoTableDb();
    const work = vi.fn().mockResolvedValue(undefined);

    // Act
    const ran = await runOnceBackfill(db, "quota-key", 1, work);

    // Assert — work ran, true returned despite setItem failure
    expect(ran).toBe(true);
    expect(work).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
  });
});
