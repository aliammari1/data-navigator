/**
 * Tests for src/features/lineage/core/snapshot.ts
 *
 * Strategy: mock `dexie` with an in-memory FakeTable so no real IndexedDB is
 * opened. The `getDb()` path that checks `typeof indexedDB === "undefined"` is
 * tested by controlling the `indexedDB` global stub per describe block.
 *
 * Two test groups:
 *   1. "no IndexedDB" — run first (before the db singleton is created), with
 *      no stub, so getDb() returns null and all functions degrade gracefully.
 *   2. "with IndexedDB" — stub `indexedDB = {}` in beforeEach so getDb()
 *      creates the Dexie instance; exercises all CRUD paths.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── In-memory table & FakeDexie created via vi.hoisted ──────────────────────

const { fakeSnapshotsTable, FakeDexie, setConstructorShouldThrow } = vi.hoisted(() => {
  let constructorShouldThrow = false;

  function setConstructorShouldThrow(v: boolean) {
    constructorShouldThrow = v;
  }

  class FakeTable {
    rows: Array<Record<string, unknown>> = [];
    _primaryKey: string;
    _reversed = false;
    _limit: number | null = null;
    _orderByField: string | null = null;

    constructor(primaryKey: string) {
      this._primaryKey = primaryKey;
    }

    _reset() {
      this.rows = [];
      this._reversed = false;
      this._limit = null;
      this._orderByField = null;
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

    async count(): Promise<number> {
      return this.rows.length;
    }

    async bulkDelete(keys: unknown[]): Promise<void> {
      this.rows = this.rows.filter((r) => !keys.includes(r[this._primaryKey]));
    }

    orderBy(field: string): this {
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

    async primaryKeys(): Promise<unknown[]> {
      let result = [...this.rows];
      if (this._orderByField) {
        const field = this._orderByField;
        result = result.sort((a, b) => {
          const av = a[field] as number;
          const bv = b[field] as number;
          return av < bv ? -1 : av > bv ? 1 : 0;
        });
      }
      if (this._limit !== null) {
        result = result.slice(0, this._limit);
      }
      this._reversed = false;
      this._limit = null;
      this._orderByField = null;
      return result.map((r) => r[this._primaryKey]);
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
      this._reversed = false;
      this._limit = null;
      this._orderByField = null;
      return result;
    }
  }

  const fakeSnapshotsTable = new FakeTable("hash");

  /**
   * FakeDexie sets `snapshots` via both the constructor and `stores()` so the
   * reference survives child-class field initializers that run between
   * `super()` and the `version().stores()` call in `LineageDb`.
   */
  class FakeDexie {
    constructor(_name: string) {
      if (constructorShouldThrow) {
        throw new Error("FakeDexie constructor error");
      }
      Object.defineProperty(this, "snapshots", {
        configurable: true,
        enumerable: true,
        writable: true,
        value: fakeSnapshotsTable,
      });
    }

    version(_v: number) {
      return {
        stores: (_schema: Record<string, string>) => {
          Object.defineProperty(this, "snapshots", {
            configurable: true,
            enumerable: true,
            writable: true,
            value: fakeSnapshotsTable,
          });
        },
      };
    }
  }

  return { fakeSnapshotsTable, FakeDexie, setConstructorShouldThrow };
});

// Mock dexie BEFORE any import of the module under test
vi.mock("dexie", () => ({
  default: FakeDexie,
}));

// ─── Import after mocking ─────────────────────────────────────────────────────

import {
  hashInput,
  loadSnapshot,
  saveSnapshot,
  listSnapshots,
  type LineageSnapshot,
} from "@/features/lineage/core/snapshot";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSnapshot(hash: string, createdAt: number): LineageSnapshot {
  return {
    hash,
    createdAt,
    nodes: [],
    edges: [],
    columnLineage: [],
    positions: {},
  };
}

// =============================================================================
// hashInput  (pure function, no DB needed)
// =============================================================================

describe("hashInput", () => {
  it("returns an 8-character zero-padded hex string", () => {
    expect(hashInput(["dataset:a:1"])).toMatch(/^[0-9a-f]{8}$/);
  });

  it("is deterministic for the same input", () => {
    const parts = ["a:1", "b:2", "c:3"];
    expect(hashInput(parts)).toBe(hashInput(parts));
  });

  it("is order-independent (sorts parts before hashing)", () => {
    expect(hashInput(["a", "b", "c"])).toBe(hashInput(["c", "a", "b"]));
  });

  it("produces different hashes for different content", () => {
    expect(hashInput(["dataset:a:1"])).not.toBe(hashInput(["dataset:a:2"]));
  });

  it("distinguishes inputs that differ only in length (length is mixed in)", () => {
    expect(hashInput(["ab", "c"])).not.toBe(hashInput(["a", "bc", ""]));
  });

  it("hashes an empty input set to a stable padded value", () => {
    const hash = hashInput([]);
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
    expect(hash).toBe(hashInput([]));
  });

  it("does not mutate the caller's array when sorting", () => {
    const parts = ["c", "a", "b"];
    hashInput(parts);
    expect(parts).toEqual(["c", "a", "b"]);
  });
});

// =============================================================================
// getDb — indexedDB unavailable branch
// These tests MUST run before any test that stubs indexedDB, so the module-
// level `db` singleton is still null and getDb() hits the undefined-check.
// =============================================================================

describe("getDb — indexedDB unavailable (db singleton is null)", () => {
  // No beforeEach stub: indexedDB remains undefined (jsdom does not provide it)
  // so getDb() returns null and all exported functions degrade gracefully.

  it("loadSnapshot returns null when indexedDB is undefined", async () => {
    const result = await loadSnapshot("any-hash");
    expect(result).toBeNull();
  });

  it("saveSnapshot resolves to undefined (void) when indexedDB is undefined", async () => {
    await expect(saveSnapshot(makeSnapshot("x", 0))).resolves.toBeUndefined();
  });

  it("listSnapshots returns an empty array when indexedDB is undefined", async () => {
    const result = await listSnapshots();
    expect(result).toEqual([]);
  });
});

// =============================================================================
// getDb — constructor throws branch
// Stub indexedDB so we reach the constructor, then force it to throw.
// =============================================================================

describe("getDb — LineageDb constructor throws", () => {
  beforeEach(() => {
    setConstructorShouldThrow(true);
    vi.stubGlobal("indexedDB", {});
  });

  afterEach(() => {
    setConstructorShouldThrow(false);
    vi.unstubAllGlobals();
  });

  it("loadSnapshot returns null when the constructor throws", async () => {
    const result = await loadSnapshot("any-hash");
    expect(result).toBeNull();
  });

  it("saveSnapshot resolves to undefined when the constructor throws", async () => {
    await expect(saveSnapshot(makeSnapshot("x", 0))).resolves.toBeUndefined();
  });

  it("listSnapshots returns empty array when the constructor throws", async () => {
    const result = await listSnapshots();
    expect(result).toEqual([]);
  });
});

// =============================================================================
// DB operations — indexedDB available (stub in beforeEach)
// After the first test in this suite the `db` singleton is created and reused.
// fakeSnapshotsTable.rows is reset each time so tests are isolated.
// =============================================================================

describe("with IndexedDB available", () => {
  beforeEach(() => {
    vi.stubGlobal("indexedDB", {});
    fakeSnapshotsTable._reset();
    setConstructorShouldThrow(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── loadSnapshot ──────────────────────────────────────────────────────────

  describe("loadSnapshot", () => {
    it("returns null when the snapshot does not exist", async () => {
      const result = await loadSnapshot("nonexistent");
      expect(result).toBeNull();
    });

    it("returns the snapshot when it exists", async () => {
      await saveSnapshot(makeSnapshot("abc12345", 1000));
      const result = await loadSnapshot("abc12345");
      expect(result).not.toBeNull();
      expect(result?.hash).toBe("abc12345");
      expect(result?.createdAt).toBe(1000);
    });

    it("returns null (not undefined) via the ?? null coercion", async () => {
      const result = await loadSnapshot("missing");
      expect(result).toBeNull();
    });

    it("returns null when the underlying get throws (catch branch)", async () => {
      const original = fakeSnapshotsTable.get;
      fakeSnapshotsTable.get = vi
        .fn()
        .mockRejectedValueOnce(new Error("db error")) as typeof original;
      const result = await loadSnapshot("any");
      expect(result).toBeNull();
      fakeSnapshotsTable.get = original;
    });
  });

  // ── saveSnapshot ──────────────────────────────────────────────────────────

  describe("saveSnapshot", () => {
    it("persists a snapshot so it can be loaded back", async () => {
      const snap = makeSnapshot("save-test", 1000);
      await saveSnapshot(snap);
      const result = await loadSnapshot("save-test");
      expect(result?.hash).toBe("save-test");
      expect(result?.createdAt).toBe(1000);
    });

    it("overwrites an existing snapshot with the same hash (upsert)", async () => {
      await saveSnapshot(makeSnapshot("dup-hash", 1000));
      await saveSnapshot(makeSnapshot("dup-hash", 2000));
      const result = await loadSnapshot("dup-hash");
      expect(result?.createdAt).toBe(2000);
    });

    it("does not throw when put throws (best-effort catch branch)", async () => {
      const original = fakeSnapshotsTable.put;
      fakeSnapshotsTable.put = vi
        .fn()
        .mockRejectedValueOnce(new Error("write error")) as typeof original;
      await expect(saveSnapshot(makeSnapshot("x", 0))).resolves.toBeUndefined();
      fakeSnapshotsTable.put = original;
    });

    it("prunes oldest snapshots when count exceeds MAX_SNAPSHOTS (10)", async () => {
      for (let i = 1; i <= 11; i++) {
        await saveSnapshot(makeSnapshot(`hash-${i}`, i * 1000));
      }
      expect(fakeSnapshotsTable.rows.length).toBe(10);
      const hashes = fakeSnapshotsTable.rows.map((r) => r["hash"]);
      expect(hashes).not.toContain("hash-1");
      expect(hashes).toContain("hash-11");
    });

    it("does not prune when count equals MAX_SNAPSHOTS exactly", async () => {
      for (let i = 1; i <= 10; i++) {
        await saveSnapshot(makeSnapshot(`exact-${i}`, i * 1000));
      }
      expect(fakeSnapshotsTable.rows.length).toBe(10);
    });

    it("skips bulkDelete when primaryKeys returns empty (stale.length === 0 branch)", async () => {
      // Patch primaryKeys to return [] even though count > MAX_SNAPSHOTS.
      // This exercises the `if (stale.length > 0)` false branch on line 101.
      const original = fakeSnapshotsTable.primaryKeys;
      fakeSnapshotsTable.primaryKeys = vi.fn().mockResolvedValueOnce([]) as typeof original;
      // Insert 11 snapshots so count > 10 triggers the pruning code path
      for (let i = 1; i <= 11; i++) {
        await saveSnapshot(makeSnapshot(`branch-${i}`, i * 1000));
      }
      // bulkDelete was not called (primaryKeys returned []), so all 11 remain
      expect(fakeSnapshotsTable.rows.length).toBe(11);
      fakeSnapshotsTable.primaryKeys = original;
    });

    it("does not prune when count is below MAX_SNAPSHOTS", async () => {
      await saveSnapshot(makeSnapshot("solo", 1000));
      expect(fakeSnapshotsTable.rows.length).toBe(1);
    });

    it("persists all LineageModel fields", async () => {
      const snap: LineageSnapshot = {
        hash: "rich-snap",
        createdAt: 9999,
        nodes: [{ id: "n1", label: "Table", type: "table", schema: "", table: "" }],
        edges: [{ id: "e1", source: "n1", target: "n2", type: "flow" }],
        columnLineage: [
          { sourceTable: "a", sourceColumn: "x", targetTable: "b", targetColumn: "y" },
        ],
        positions: { n1: { x: 10, y: 20 } },
      };
      await saveSnapshot(snap);
      const loaded = await loadSnapshot("rich-snap");
      expect(loaded?.nodes).toHaveLength(1);
      expect(loaded?.edges).toHaveLength(1);
      expect(loaded?.columnLineage).toHaveLength(1);
      expect(loaded?.positions).toEqual({ n1: { x: 10, y: 20 } });
    });
  });

  // ── listSnapshots ─────────────────────────────────────────────────────────

  describe("listSnapshots", () => {
    it("returns an empty array when no snapshots have been saved", async () => {
      const result = await listSnapshots();
      expect(result).toEqual([]);
    });

    it("returns all saved snapshots", async () => {
      await saveSnapshot(makeSnapshot("h1", 1000));
      await saveSnapshot(makeSnapshot("h2", 2000));
      const result = await listSnapshots();
      expect(result).toHaveLength(2);
    });

    it("returns snapshots in reverse-chronological order (newest first)", async () => {
      await saveSnapshot(makeSnapshot("old", 1000));
      await saveSnapshot(makeSnapshot("new", 3000));
      await saveSnapshot(makeSnapshot("mid", 2000));
      const result = await listSnapshots();
      expect(result[0]?.hash).toBe("new");
      expect(result[1]?.hash).toBe("mid");
      expect(result[2]?.hash).toBe("old");
    });

    it("returns empty array when orderBy throws (catch branch)", async () => {
      const original = fakeSnapshotsTable.orderBy;
      fakeSnapshotsTable.orderBy = vi.fn().mockImplementationOnce(() => {
        throw new Error("list error");
      }) as typeof original;
      const result = await listSnapshots();
      expect(result).toEqual([]);
      fakeSnapshotsTable.orderBy = original;
    });
  });
});
