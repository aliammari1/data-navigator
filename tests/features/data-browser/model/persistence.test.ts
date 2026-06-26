/**
 * Unit tests for @/features/data-browser/model/persistence
 *
 * Mocks:
 *   - @/platform/storage  (listSavedQueries, putSavedQuery, deleteSavedQuery, newId)
 *
 * All target-module logic is kept real; nothing opens IndexedDB.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock the storage boundary so nothing opens IndexedDB / Dexie ──────────────
const listSavedQueriesMock = vi.fn();
const putSavedQueryMock = vi.fn();
const deleteSavedQueryMock = vi.fn();
let idCounter = 0;
const newIdMock = vi.fn(() => `id-${++idCounter}`);

vi.mock("@/platform/storage", () => ({
  listSavedQueries: (...args: unknown[]) => listSavedQueriesMock(...args),
  putSavedQuery: (...args: unknown[]) => putSavedQueryMock(...args),
  deleteSavedQuery: (...args: unknown[]) => deleteSavedQueryMock(...args),
  newId: () => newIdMock(),
}));

// ── Import after mocks are set up ─────────────────────────────────────────────
import {
  listSavedFilters,
  saveFilter,
  listSavedSql,
  saveSql,
  removeSavedRecord,
  loadStarredKeys,
  saveStarredKeys,
} from "@/features/data-browser/model/persistence";
import type { FilterGroup } from "@/features/data-browser/model/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFilterGroup(overrides: Partial<FilterGroup> = {}): FilterGroup {
  return {
    id: "g1",
    logic: "AND",
    rules: [],
    name: "Test Group",
    saved: false,
    ...overrides,
  };
}

/** Build a minimal SavedQuery row as Dexie would return it. */
function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "row-1",
    name: "Test",
    kind: "filter" as const,
    datasetId: "ds-1",
    updatedAt: 1000,
    definition: { group: makeFilterGroup() },
    ...overrides,
  };
}

beforeEach(() => {
  listSavedQueriesMock.mockReset();
  putSavedQueryMock.mockReset();
  deleteSavedQueryMock.mockReset();
  newIdMock.mockClear();
  idCounter = 0;
});

// ── listSavedFilters ──────────────────────────────────────────────────────────

describe("listSavedFilters", () => {
  it("returns an empty array when no rows match the datasetId", async () => {
    listSavedQueriesMock.mockResolvedValue([
      makeRow({ datasetId: "other-ds" }),
    ]);

    const result = await listSavedFilters("ds-1");

    expect(listSavedQueriesMock).toHaveBeenCalledWith("filter");
    expect(result).toEqual([]);
  });

  it("returns an empty array when definition is not a valid filter definition (null)", async () => {
    listSavedQueriesMock.mockResolvedValue([
      makeRow({ datasetId: "ds-1", definition: null }),
    ]);

    const result = await listSavedFilters("ds-1");
    expect(result).toEqual([]);
  });

  it("returns an empty array when definition is not an object (string)", async () => {
    listSavedQueriesMock.mockResolvedValue([
      makeRow({ datasetId: "ds-1", definition: "not-an-object" }),
    ]);

    const result = await listSavedFilters("ds-1");
    expect(result).toEqual([]);
  });

  it("returns an empty array when definition lacks the group key", async () => {
    listSavedQueriesMock.mockResolvedValue([
      makeRow({ datasetId: "ds-1", definition: { noGroup: true } }),
    ]);

    const result = await listSavedFilters("ds-1");
    expect(result).toEqual([]);
  });

  it("returns an empty array when definition.group is not an object (string)", async () => {
    listSavedQueriesMock.mockResolvedValue([
      makeRow({ datasetId: "ds-1", definition: { group: "not-object" } }),
    ]);

    const result = await listSavedFilters("ds-1");
    expect(result).toEqual([]);
  });

  it("maps valid rows into SavedFilterRecord shape", async () => {
    const group = makeFilterGroup({ id: "gx", name: "My Filter" });
    listSavedQueriesMock.mockResolvedValue([
      makeRow({
        id: "flt-1",
        name: "Filter A",
        datasetId: "ds-1",
        updatedAt: 9999,
        definition: { group },
      }),
    ]);

    const result = await listSavedFilters("ds-1");

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "flt-1",
      name: "Filter A",
      datasetId: "ds-1",
      group,
      updatedAt: 9999,
    });
  });

  it("filters out rows belonging to other datasets but keeps the matching ones", async () => {
    const group = makeFilterGroup();
    listSavedQueriesMock.mockResolvedValue([
      makeRow({ id: "r1", datasetId: "ds-1", definition: { group } }),
      makeRow({ id: "r2", datasetId: "other", definition: { group } }),
      makeRow({ id: "r3", datasetId: "ds-1", definition: { group } }),
    ]);

    const result = await listSavedFilters("ds-1");
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(["r1", "r3"]);
  });

  it("includes rows where definition.group is null (typeof null === 'object' passes the guard)", async () => {
    // The isFilterDefinition check uses typeof group === "object", and typeof null === "object",
    // so null group passes through — the mapped row has group: null.
    listSavedQueriesMock.mockResolvedValue([
      makeRow({ id: "r-null", name: "N", datasetId: "ds-1", updatedAt: 1, definition: { group: null } }),
    ]);

    const result = await listSavedFilters("ds-1");
    expect(result).toHaveLength(1);
    expect(result[0].group).toBeNull();
  });

  it("returns an empty array when listSavedQueries returns an empty array", async () => {
    listSavedQueriesMock.mockResolvedValue([]);
    const result = await listSavedFilters("ds-1");
    expect(result).toEqual([]);
  });
});

// ── saveFilter ────────────────────────────────────────────────────────────────

describe("saveFilter", () => {
  it("calls putSavedQuery with the correct shape and returns the generated id", async () => {
    putSavedQueryMock.mockResolvedValue(undefined);
    const group = makeFilterGroup();

    const id = await saveFilter("ds-1", "My Filter", group);

    expect(id).toBe("flt:ds-1:id-1");
    expect(putSavedQueryMock).toHaveBeenCalledTimes(1);
    expect(putSavedQueryMock).toHaveBeenCalledWith({
      id: "flt:ds-1:id-1",
      name: "My Filter",
      kind: "filter",
      datasetId: "ds-1",
      definition: { group },
    });
  });

  it("uses newId() to generate unique ids each time", async () => {
    putSavedQueryMock.mockResolvedValue(undefined);
    const group = makeFilterGroup();

    const id1 = await saveFilter("ds-1", "Filter 1", group);
    const id2 = await saveFilter("ds-1", "Filter 2", group);

    expect(id1).toBe("flt:ds-1:id-1");
    expect(id2).toBe("flt:ds-1:id-2");
    expect(newIdMock).toHaveBeenCalledTimes(2);
  });

  it("embeds the datasetId into the id prefix", async () => {
    putSavedQueryMock.mockResolvedValue(undefined);
    const group = makeFilterGroup();

    const id = await saveFilter("my-dataset", "Test", group);
    expect(id).toMatch(/^flt:my-dataset:/);
  });
});

// ── listSavedSql ──────────────────────────────────────────────────────────────

describe("listSavedSql", () => {
  it("calls listSavedQueries with kind 'query'", async () => {
    listSavedQueriesMock.mockResolvedValue([]);
    await listSavedSql("ds-1");
    expect(listSavedQueriesMock).toHaveBeenCalledWith("query");
  });

  it("returns an empty array when no rows match the datasetId", async () => {
    listSavedQueriesMock.mockResolvedValue([
      makeRow({ id: "q1", datasetId: "other", definition: { sql: "SELECT 1" } }),
    ]);

    const result = await listSavedSql("ds-1");
    expect(result).toEqual([]);
  });

  it("returns an empty array when definition is null", async () => {
    listSavedQueriesMock.mockResolvedValue([
      makeRow({ datasetId: "ds-1", definition: null }),
    ]);

    const result = await listSavedSql("ds-1");
    expect(result).toEqual([]);
  });

  it("returns an empty array when definition is not an object (number)", async () => {
    listSavedQueriesMock.mockResolvedValue([
      makeRow({ datasetId: "ds-1", definition: 42 }),
    ]);

    const result = await listSavedSql("ds-1");
    expect(result).toEqual([]);
  });

  it("returns an empty array when definition lacks the sql key", async () => {
    listSavedQueriesMock.mockResolvedValue([
      makeRow({ datasetId: "ds-1", definition: { query: "SELECT 1" } }),
    ]);

    const result = await listSavedSql("ds-1");
    expect(result).toEqual([]);
  });

  it("returns an empty array when definition.sql is not a string (number)", async () => {
    listSavedQueriesMock.mockResolvedValue([
      makeRow({ datasetId: "ds-1", definition: { sql: 99 } }),
    ]);

    const result = await listSavedSql("ds-1");
    expect(result).toEqual([]);
  });

  it("maps valid rows into SavedSqlRecord shape", async () => {
    listSavedQueriesMock.mockResolvedValue([
      makeRow({
        id: "sql-1",
        name: "Query A",
        datasetId: "ds-1",
        updatedAt: 8888,
        definition: { sql: "SELECT * FROM t" },
      }),
    ]);

    const result = await listSavedSql("ds-1");

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "sql-1",
      name: "Query A",
      datasetId: "ds-1",
      sql: "SELECT * FROM t",
      updatedAt: 8888,
    });
  });

  it("filters by datasetId and keeps only matching rows", async () => {
    listSavedQueriesMock.mockResolvedValue([
      makeRow({ id: "q1", datasetId: "ds-1", definition: { sql: "SELECT 1" } }),
      makeRow({ id: "q2", datasetId: "other", definition: { sql: "SELECT 2" } }),
    ]);

    const result = await listSavedSql("ds-1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("q1");
  });

  it("returns an empty array when listSavedQueries returns empty", async () => {
    listSavedQueriesMock.mockResolvedValue([]);
    const result = await listSavedSql("ds-1");
    expect(result).toEqual([]);
  });
});

// ── saveSql ───────────────────────────────────────────────────────────────────

describe("saveSql", () => {
  it("calls putSavedQuery with the correct shape and returns the generated id", async () => {
    putSavedQueryMock.mockResolvedValue(undefined);

    const id = await saveSql("ds-1", "My Query", "SELECT 1");

    expect(id).toBe("sql:ds-1:id-1");
    expect(putSavedQueryMock).toHaveBeenCalledWith({
      id: "sql:ds-1:id-1",
      name: "My Query",
      kind: "query",
      datasetId: "ds-1",
      definition: { sql: "SELECT 1" },
    });
  });

  it("generates unique ids on successive calls", async () => {
    putSavedQueryMock.mockResolvedValue(undefined);

    const id1 = await saveSql("ds-1", "Q1", "SELECT 1");
    const id2 = await saveSql("ds-1", "Q2", "SELECT 2");

    expect(id1).not.toBe(id2);
    expect(id1).toBe("sql:ds-1:id-1");
    expect(id2).toBe("sql:ds-1:id-2");
  });

  it("embeds the datasetId into the id prefix", async () => {
    putSavedQueryMock.mockResolvedValue(undefined);
    const id = await saveSql("my-ds", "Q", "SELECT 1");
    expect(id).toMatch(/^sql:my-ds:/);
  });
});

// ── removeSavedRecord ─────────────────────────────────────────────────────────

describe("removeSavedRecord", () => {
  it("delegates to deleteSavedQuery with the provided id", async () => {
    deleteSavedQueryMock.mockResolvedValue(undefined);

    await removeSavedRecord("flt:ds-1:some-id");

    expect(deleteSavedQueryMock).toHaveBeenCalledTimes(1);
    expect(deleteSavedQueryMock).toHaveBeenCalledWith("flt:ds-1:some-id");
  });

  it("resolves without returning a value", async () => {
    deleteSavedQueryMock.mockResolvedValue(undefined);
    const result = await removeSavedRecord("any-id");
    expect(result).toBeUndefined();
  });
});

// ── loadStarredKeys ───────────────────────────────────────────────────────────

describe("loadStarredKeys", () => {
  it("calls listSavedQueries with kind 'filter'", async () => {
    listSavedQueriesMock.mockResolvedValue([]);
    await loadStarredKeys("ds-1");
    expect(listSavedQueriesMock).toHaveBeenCalledWith("filter");
  });

  it("returns an empty Set when no starred record exists for the dataset", async () => {
    listSavedQueriesMock.mockResolvedValue([
      makeRow({ id: "star:other-ds", datasetId: "other-ds", definition: { keys: ["k1"] } }),
    ]);

    const result = await loadStarredKeys("ds-1");
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it("returns the set of starred keys from the matched record", async () => {
    listSavedQueriesMock.mockResolvedValue([
      makeRow({
        id: "star:ds-1",
        datasetId: "ds-1",
        definition: { keys: ["row-a", "row-b", "row-c"] },
      }),
    ]);

    const result = await loadStarredKeys("ds-1");
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(3);
    expect(result.has("row-a")).toBe(true);
    expect(result.has("row-b")).toBe(true);
    expect(result.has("row-c")).toBe(true);
  });

  it("returns an empty Set when the record's definition.keys is not an array", async () => {
    listSavedQueriesMock.mockResolvedValue([
      makeRow({
        id: "star:ds-1",
        datasetId: "ds-1",
        definition: { keys: "not-an-array" },
      }),
    ]);

    const result = await loadStarredKeys("ds-1");
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it("returns an empty Set when the record's definition is null", async () => {
    listSavedQueriesMock.mockResolvedValue([
      makeRow({
        id: "star:ds-1",
        datasetId: "ds-1",
        definition: null,
      }),
    ]);

    const result = await loadStarredKeys("ds-1");
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it("returns an empty Set when the record's definition has no keys property", async () => {
    listSavedQueriesMock.mockResolvedValue([
      makeRow({
        id: "star:ds-1",
        datasetId: "ds-1",
        definition: {},
      }),
    ]);

    const result = await loadStarredKeys("ds-1");
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it("returns an empty Set when rows is empty", async () => {
    listSavedQueriesMock.mockResolvedValue([]);
    const result = await loadStarredKeys("ds-1");
    expect(result.size).toBe(0);
  });

  it("uses the deterministic id 'star:<datasetId>' to find the record", async () => {
    listSavedQueriesMock.mockResolvedValue([
      makeRow({ id: "star:ds-xyz", definition: { keys: ["k1"] } }),
    ]);

    const result = await loadStarredKeys("ds-xyz");
    expect(result.has("k1")).toBe(true);
  });
});

// ── saveStarredKeys ───────────────────────────────────────────────────────────

describe("saveStarredKeys", () => {
  it("calls putSavedQuery with the correct shape for the deterministic id", async () => {
    putSavedQueryMock.mockResolvedValue(undefined);
    const keys = new Set(["row-1", "row-2"]);

    await saveStarredKeys("ds-1", keys);

    expect(putSavedQueryMock).toHaveBeenCalledTimes(1);
    expect(putSavedQueryMock).toHaveBeenCalledWith({
      id: "star:ds-1",
      name: "__starred__",
      kind: "filter",
      datasetId: "ds-1",
      definition: { keys: expect.arrayContaining(["row-1", "row-2"]) },
    });
    // definition.keys should contain exactly the two items
    const call = putSavedQueryMock.mock.calls[0][0] as { definition: { keys: string[] } };
    expect(call.definition.keys).toHaveLength(2);
  });

  it("resolves without returning a value", async () => {
    putSavedQueryMock.mockResolvedValue(undefined);
    const result = await saveStarredKeys("ds-1", new Set(["a"]));
    expect(result).toBeUndefined();
  });

  it("converts the Set to an array in the definition", async () => {
    putSavedQueryMock.mockResolvedValue(undefined);
    const keys = new Set(["alpha", "beta", "gamma"]);

    await saveStarredKeys("ds-2", keys);

    const call = putSavedQueryMock.mock.calls[0][0] as { definition: { keys: unknown } };
    expect(Array.isArray(call.definition.keys)).toBe(true);
  });

  it("stores an empty array when the Set is empty", async () => {
    putSavedQueryMock.mockResolvedValue(undefined);

    await saveStarredKeys("ds-3", new Set());

    const call = putSavedQueryMock.mock.calls[0][0] as { definition: { keys: unknown[] } };
    expect(call.definition.keys).toEqual([]);
  });

  it("uses the deterministic id 'star:<datasetId>' (not newId)", async () => {
    putSavedQueryMock.mockResolvedValue(undefined);

    await saveStarredKeys("ds-99", new Set(["k"]));

    expect(newIdMock).not.toHaveBeenCalled();
    const call = putSavedQueryMock.mock.calls[0][0] as { id: string };
    expect(call.id).toBe("star:ds-99");
  });
});
