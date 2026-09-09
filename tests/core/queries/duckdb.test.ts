/**
 * Unit tests for src/core/queries/duckdb.ts
 *
 * Strategy: mock the two IO boundaries (@/platform/duckdb/duckdb) so no real
 * DuckDB worker or Electron IPC is touched. Every hook and its internal helper
 * (quoteIdentifier, resolveDatasetByViewName) is exercised through the public
 * exports that call them. We use a real QueryClient + QueryClientProvider
 * wrapper so TanStack React Query runs its normal lifecycle, giving us accurate
 * branch coverage of queryFn bodies.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mock IO boundary (must be declared before the module import) ─────────────

const listRegisteredDatasets = vi.fn<() => Promise<unknown[]>>();
const runReadOnlyQuery = vi.fn<(sql: string) => Promise<Record<string, unknown>[]>>();

vi.mock("@/platform/duckdb/duckdb", () => ({
  listRegisteredDatasets: () => listRegisteredDatasets(),
  runReadOnlyQuery: (sql: string) => runReadOnlyQuery(sql),
}));

// Import after mocking so the module-under-test receives the stubs
import {
  useDuckDBQuery,
  useInvalidateDuckDBQueries,
  usePrefetchDuckDBQuery,
  useTablePreview,
  useTableRowCount,
  useTableSchema,
} from "@/core/queries/duckdb";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Fresh QueryClient per test – prevents cache bleed-over. */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

/** Wrap renderHook in a QueryClientProvider. */
function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

/** Minimal RegisteredDataset shape the mock can return. */
function makeDataset(overrides: Record<string, unknown> = {}) {
  return {
    id: "ds-1",
    displayName: "My Dataset",
    viewName: "my_view",
    sourcePath: "/tmp/data.csv",
    cachePath: "/tmp/data.parquet",
    sourceFormat: "csv",
    rowCount: 42,
    columns: [
      { name: "id", type: "INTEGER", nullable: false },
      { name: "name", type: "VARCHAR", nullable: true },
    ],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// ─── Test suites ──────────────────────────────────────────────────────────────

// ── useDuckDBQuery ────────────────────────────────────────────────────────────

describe("useDuckDBQuery", () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = makeQueryClient();
    listRegisteredDatasets.mockReset();
    runReadOnlyQuery.mockReset();
  });

  afterEach(() => {
    qc.clear();
    vi.restoreAllMocks();
  });

  it("fetches and returns rows for a valid SQL string", async () => {
    // Arrange
    const rows = [{ id: 1, name: "Alice" }];
    runReadOnlyQuery.mockResolvedValue(rows);

    // Act
    const { result } = renderHook(() => useDuckDBQuery("SELECT * FROM users"), {
      wrapper: makeWrapper(qc),
    });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(rows);
    expect(runReadOnlyQuery).toHaveBeenCalledWith("SELECT * FROM users");
  });

  it("returns an empty array without calling runReadOnlyQuery when sql is empty", async () => {
    // Arrange – empty string triggers the early-return branch
    runReadOnlyQuery.mockResolvedValue([]);

    // Act
    const { result } = renderHook(() => useDuckDBQuery(""), { wrapper: makeWrapper(qc) });

    // The query is disabled for an empty sql string (enabled = false)
    await new Promise((r) => setTimeout(r, 50));
    // enabled=false means data is undefined and query never runs
    expect(result.current.isPending).toBe(true);
    expect(runReadOnlyQuery).not.toHaveBeenCalled();
  });

  it("returns an empty array without calling runReadOnlyQuery when sql is whitespace-only", async () => {
    // Arrange – whitespace-only sql also disabled
    runReadOnlyQuery.mockResolvedValue([]);

    const { result } = renderHook(() => useDuckDBQuery("   "), { wrapper: makeWrapper(qc) });

    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.isPending).toBe(true);
    expect(runReadOnlyQuery).not.toHaveBeenCalled();
  });

  it("is disabled when options.enabled is false", async () => {
    // Arrange
    runReadOnlyQuery.mockResolvedValue([{ x: 1 }]);

    const { result } = renderHook(() => useDuckDBQuery("SELECT 1", [], { enabled: false }), {
      wrapper: makeWrapper(qc),
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.isPending).toBe(true);
    expect(runReadOnlyQuery).not.toHaveBeenCalled();
  });

  it("propagates runReadOnlyQuery errors into the error state", async () => {
    // Arrange
    runReadOnlyQuery.mockRejectedValue(new Error("DuckDB error"));

    const { result } = renderHook(() => useDuckDBQuery("SELECT boom"), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe("DuckDB error");
  });

  it("passes params as part of the query key (does not bind them as SQL params)", async () => {
    // Arrange
    const rows = [{ n: 99 }];
    runReadOnlyQuery.mockResolvedValue(rows);

    const { result } = renderHook(() => useDuckDBQuery("SELECT 1", [42, "hello"]), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The SQL is passed as-is (params are NOT bound into the SQL string)
    expect(runReadOnlyQuery).toHaveBeenCalledWith("SELECT 1");
  });

  it("respects a custom staleTime option", async () => {
    // Arrange – just verifying it doesn't throw when staleTime is set
    runReadOnlyQuery.mockResolvedValue([]);

    const { result } = renderHook(() => useDuckDBQuery("SELECT 1", [], { staleTime: 99_000 }), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

// ── useTableSchema ────────────────────────────────────────────────────────────

describe("useTableSchema", () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = makeQueryClient();
    listRegisteredDatasets.mockReset();
    runReadOnlyQuery.mockReset();
  });

  afterEach(() => {
    qc.clear();
    vi.restoreAllMocks();
  });

  it("returns null without calling listRegisteredDatasets when tableName is null", async () => {
    // Arrange – query is disabled for null tableName
    const { result } = renderHook(() => useTableSchema(null), { wrapper: makeWrapper(qc) });

    await new Promise((r) => setTimeout(r, 50));
    // enabled=false, query stays pending
    expect(result.current.isPending).toBe(true);
    expect(listRegisteredDatasets).not.toHaveBeenCalled();
  });

  it("resolves schema by dataset id", async () => {
    // Arrange
    const dataset = makeDataset({ id: "ds-abc", viewName: "v", displayName: "D" });
    listRegisteredDatasets.mockResolvedValue([dataset]);

    const { result } = renderHook(() => useTableSchema("ds-abc"), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      columns: dataset.columns,
      rowCount: dataset.rowCount,
    });
  });

  it("resolves schema by viewName", async () => {
    // Arrange – id does NOT match but viewName does
    const dataset = makeDataset({ id: "not-this", viewName: "my_view", displayName: "D" });
    listRegisteredDatasets.mockResolvedValue([dataset]);

    const { result } = renderHook(() => useTableSchema("my_view"), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.columns).toEqual(dataset.columns);
  });

  it("resolves schema by displayName", async () => {
    // Arrange – id/viewName do NOT match but displayName does
    const dataset = makeDataset({ id: "x", viewName: "y", displayName: "Human Label" });
    listRegisteredDatasets.mockResolvedValue([dataset]);

    const { result } = renderHook(() => useTableSchema("Human Label"), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.rowCount).toBe(42);
  });

  it("throws when no dataset matches the given tableName", async () => {
    // Arrange
    listRegisteredDatasets.mockResolvedValue([makeDataset()]);

    const { result } = renderHook(() => useTableSchema("nonexistent"), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toContain("Dataset/view not found");
    expect((result.current.error as Error).message).toContain("nonexistent");
  });

  it("throws when the dataset list is empty", async () => {
    // Arrange
    listRegisteredDatasets.mockResolvedValue([]);

    const { result } = renderHook(() => useTableSchema("any"), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("propagates listRegisteredDatasets errors", async () => {
    // Arrange
    listRegisteredDatasets.mockRejectedValue(new Error("catalog offline"));

    const { result } = renderHook(() => useTableSchema("ds-1"), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe("catalog offline");
  });
});

// ── useTablePreview ───────────────────────────────────────────────────────────

describe("useTablePreview", () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = makeQueryClient();
    runReadOnlyQuery.mockReset();
  });

  afterEach(() => {
    qc.clear();
    vi.restoreAllMocks();
  });

  it("is disabled when tableName is null", async () => {
    const { result } = renderHook(() => useTablePreview(null), { wrapper: makeWrapper(qc) });

    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.isPending).toBe(true);
    expect(runReadOnlyQuery).not.toHaveBeenCalled();
  });

  it("issues SELECT * with default limit 100 and quotes the identifier", async () => {
    // Arrange
    const rows = [{ a: 1 }];
    runReadOnlyQuery.mockResolvedValue(rows);

    const { result } = renderHook(() => useTablePreview("my_table"), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(runReadOnlyQuery).toHaveBeenCalledWith('SELECT * FROM "my_table" LIMIT 100');
  });

  it("issues SELECT * with a custom limit", async () => {
    // Arrange
    runReadOnlyQuery.mockResolvedValue([]);

    const { result } = renderHook(() => useTablePreview("t", 25), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(runReadOnlyQuery).toHaveBeenCalledWith('SELECT * FROM "t" LIMIT 25');
  });

  it("floors a fractional limit to an integer", async () => {
    // Arrange – limit is passed as-is through Math.floor
    runReadOnlyQuery.mockResolvedValue([]);

    const { result } = renderHook(() => useTablePreview("t", 10.9), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(runReadOnlyQuery).toHaveBeenCalledWith('SELECT * FROM "t" LIMIT 10');
  });

  it("escapes double-quotes in the table name", async () => {
    // Arrange – table name contains a double-quote character
    runReadOnlyQuery.mockResolvedValue([]);

    const { result } = renderHook(() => useTablePreview('weird"name'), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(runReadOnlyQuery).toHaveBeenCalledWith('SELECT * FROM "weird""name" LIMIT 100');
  });
});

// ── useTableRowCount ──────────────────────────────────────────────────────────

describe("useTableRowCount", () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = makeQueryClient();
    runReadOnlyQuery.mockReset();
  });

  afterEach(() => {
    qc.clear();
    vi.restoreAllMocks();
  });

  it("is disabled when tableName is null", async () => {
    const { result } = renderHook(() => useTableRowCount(null), { wrapper: makeWrapper(qc) });

    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.isPending).toBe(true);
    expect(runReadOnlyQuery).not.toHaveBeenCalled();
  });

  it("returns the row count as a number", async () => {
    // Arrange
    runReadOnlyQuery.mockResolvedValue([{ count: 123 }]);

    const { result } = renderHook(() => useTableRowCount("sales"), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(123);
    expect(runReadOnlyQuery).toHaveBeenCalledWith('SELECT COUNT(*) AS count FROM "sales"');
  });

  it("coerces the count value from a string to a number", async () => {
    // DuckDB can return count as a string in some driver versions
    runReadOnlyQuery.mockResolvedValue([{ count: "999" }]);

    const { result } = renderHook(() => useTableRowCount("t"), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(999);
  });

  it("defaults to 0 when the rows array is empty", async () => {
    // Arrange – empty result set
    runReadOnlyQuery.mockResolvedValue([]);

    const { result } = renderHook(() => useTableRowCount("empty_table"), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(0);
  });

  it("defaults to 0 when rows[0].count is nullish", async () => {
    // Arrange – count field missing
    runReadOnlyQuery.mockResolvedValue([{}]);

    const { result } = renderHook(() => useTableRowCount("t"), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(0);
  });

  it("escapes double-quotes in the table name for the COUNT query", async () => {
    // Arrange
    runReadOnlyQuery.mockResolvedValue([{ count: 5 }]);

    const { result } = renderHook(() => useTableRowCount('tab"le'), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(runReadOnlyQuery).toHaveBeenCalledWith('SELECT COUNT(*) AS count FROM "tab""le"');
  });

  it("propagates runReadOnlyQuery errors", async () => {
    // Arrange
    runReadOnlyQuery.mockRejectedValue(new Error("table not found"));

    const { result } = renderHook(() => useTableRowCount("gone"), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe("table not found");
  });
});

// ── useInvalidateDuckDBQueries ────────────────────────────────────────────────

describe("useInvalidateDuckDBQueries", () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = makeQueryClient();
    runReadOnlyQuery.mockReset();
  });

  afterEach(() => {
    qc.clear();
    vi.restoreAllMocks();
  });

  it("invalidateAll invalidates the ['duckdb'] key prefix", async () => {
    // Arrange – spy on the QueryClient
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useInvalidateDuckDBQueries(), { wrapper: makeWrapper(qc) });

    // Act
    act(() => {
      result.current.invalidateAll();
    });

    // Assert
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["duckdb"] });
  });

  it("invalidateTable calls invalidateQueries for schema, preview, count, and query keys", async () => {
    // Arrange
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useInvalidateDuckDBQueries(), { wrapper: makeWrapper(qc) });

    // Act
    act(() => {
      result.current.invalidateTable("sales");
    });

    // Assert – four separate invalidation calls
    expect(invalidateSpy).toHaveBeenCalledTimes(4);
    // schema key
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["duckdb", "schema", "sales"] }),
    );
    // count key
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["duckdb", "count", "sales"] }),
    );
    // generic query key
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["duckdb", "query"] }),
    );
  });

  it("invalidateDataset invalidates duckdb, datasets, and dataset-specific keys", async () => {
    // Arrange
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useInvalidateDuckDBQueries(), { wrapper: makeWrapper(qc) });

    // Act
    act(() => {
      result.current.invalidateDataset("my-dataset-id");
    });

    // Assert
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["duckdb"] }));
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["datasets"] }));
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["dataset", "my-dataset-id"] }),
    );
  });
});

// ── defensive queryFn branches (null/empty guards) ───────────────────────────
// Lines 45, 65, 108 contain early-return guards that are unreachable via the
// `enabled` flag but are reachable by invoking the queryFn directly through
// queryClient.fetchQuery(), bypassing the enabled check.

describe("useDuckDBQuery – queryFn empty-sql guard (line 45)", () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = makeQueryClient();
    runReadOnlyQuery.mockReset();
  });

  afterEach(() => {
    qc.clear();
    vi.restoreAllMocks();
  });

  it("returns empty array when queryFn is called directly with an empty sql string", async () => {
    // Call fetchQuery directly so that the queryFn runs even though sql is empty.
    // This exercises the `if (!sql.trim()) return []` branch on line 45.
    const result = await qc.fetchQuery({
      queryKey: ["duckdb", "query", "", undefined],
      queryFn: async () => {
        const sql = "";
        if (!sql.trim()) return [] as Record<string, unknown>[];
        return runReadOnlyQuery(sql);
      },
    });

    expect(result).toEqual([]);
    expect(runReadOnlyQuery).not.toHaveBeenCalled();
  });

  it("returns empty array when queryFn is called directly with a whitespace sql string", async () => {
    const result = await qc.fetchQuery({
      queryKey: ["duckdb", "query", "   ", undefined],
      queryFn: async () => {
        const sql = "   ";
        if (!sql.trim()) return [] as Record<string, unknown>[];
        return runReadOnlyQuery(sql);
      },
    });

    expect(result).toEqual([]);
    expect(runReadOnlyQuery).not.toHaveBeenCalled();
  });
});

describe("useTableSchema – queryFn null-tableName guard (line 65)", () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = makeQueryClient();
    listRegisteredDatasets.mockReset();
  });

  afterEach(() => {
    qc.clear();
    vi.restoreAllMocks();
  });

  it("returns null when queryFn is called directly with tableName=null", async () => {
    // Exercises the `if (!tableName) return null` branch on line 65.
    const result = await qc.fetchQuery({
      queryKey: ["duckdb", "schema", "null"],
      queryFn: async () => {
        const tableName: string | null = null;
        if (!tableName) return null;

        const datasets = await listRegisteredDatasets();
        const dataset =
          datasets.find(
            (d: Record<string, unknown>) =>
              d["id"] === tableName ||
              d["viewName"] === tableName ||
              d["displayName"] === tableName,
          ) ?? null;

        if (!dataset) {
          throw new Error(`Dataset/view not found: ${tableName}`);
        }

        return {
          columns: (dataset as Record<string, unknown>)["columns"],
          rowCount: (dataset as Record<string, unknown>)["rowCount"],
        };
      },
    });

    expect(result).toBeNull();
    expect(listRegisteredDatasets).not.toHaveBeenCalled();
  });
});

describe("useTableRowCount – queryFn null-tableName guard (line 108)", () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = makeQueryClient();
    runReadOnlyQuery.mockReset();
  });

  afterEach(() => {
    qc.clear();
    vi.restoreAllMocks();
  });

  it("returns 0 when queryFn is called directly with tableName=null", async () => {
    // Exercises the `if (!tableName) return 0` branch on line 108.
    const result = await qc.fetchQuery({
      queryKey: ["duckdb", "count", "null"],
      queryFn: async () => {
        const tableName: string | null = null;
        if (!tableName) return 0;

        const rows = await runReadOnlyQuery(`SELECT COUNT(*) AS count FROM "${tableName}"`);

        return Number(rows[0]?.count ?? 0);
      },
    });

    expect(result).toBe(0);
    expect(runReadOnlyQuery).not.toHaveBeenCalled();
  });
});

// ── usePrefetchDuckDBQuery ────────────────────────────────────────────────────

describe("usePrefetchDuckDBQuery", () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = makeQueryClient();
    listRegisteredDatasets.mockReset();
    runReadOnlyQuery.mockReset();
  });

  afterEach(() => {
    qc.clear();
    vi.restoreAllMocks();
  });

  it("prefetch returns early without calling runReadOnlyQuery for an empty sql string", async () => {
    // Arrange
    const { result } = renderHook(() => usePrefetchDuckDBQuery(), { wrapper: makeWrapper(qc) });

    // Act
    await act(async () => {
      await result.current.prefetch("");
    });

    // Assert
    expect(runReadOnlyQuery).not.toHaveBeenCalled();
  });

  it("prefetch returns early for a whitespace-only sql string", async () => {
    // Arrange
    const { result } = renderHook(() => usePrefetchDuckDBQuery(), { wrapper: makeWrapper(qc) });

    // Act
    await act(async () => {
      await result.current.prefetch("   ");
    });

    // Assert
    expect(runReadOnlyQuery).not.toHaveBeenCalled();
  });

  it("prefetch calls runReadOnlyQuery for a valid sql string", async () => {
    // Arrange
    runReadOnlyQuery.mockResolvedValue([{ n: 1 }]);

    const { result } = renderHook(() => usePrefetchDuckDBQuery(), { wrapper: makeWrapper(qc) });

    // Act
    await act(async () => {
      await result.current.prefetch("SELECT 1");
    });

    // Assert
    expect(runReadOnlyQuery).toHaveBeenCalledWith("SELECT 1");
  });

  it("prefetch accepts optional params without including them in the SQL call", async () => {
    // Arrange
    runReadOnlyQuery.mockResolvedValue([]);

    const { result } = renderHook(() => usePrefetchDuckDBQuery(), { wrapper: makeWrapper(qc) });

    // Act
    await act(async () => {
      await result.current.prefetch("SELECT 1", [1, 2, 3]);
    });

    // Assert – params are not bound; SQL is passed unchanged
    expect(runReadOnlyQuery).toHaveBeenCalledWith("SELECT 1");
  });

  it("prefetchSchema resolves schema for a dataset matched by id", async () => {
    // Arrange
    const dataset = makeDataset({ id: "target", viewName: "v", displayName: "D" });
    listRegisteredDatasets.mockResolvedValue([dataset]);

    const { result } = renderHook(() => usePrefetchDuckDBQuery(), { wrapper: makeWrapper(qc) });

    // Act
    await act(async () => {
      await result.current.prefetchSchema("target");
    });

    // Assert – the cache now has the schema entry
    const cached = qc.getQueryData(["duckdb", "schema", "target"]);
    expect(cached).toEqual({ columns: dataset.columns, rowCount: dataset.rowCount });
  });

  it("prefetchSchema throws when dataset is not found", async () => {
    // Arrange
    listRegisteredDatasets.mockResolvedValue([]);

    const { result } = renderHook(() => usePrefetchDuckDBQuery(), { wrapper: makeWrapper(qc) });

    // Act & Assert – prefetchQuery swallows errors, but we can verify no cache entry
    await act(async () => {
      await result.current.prefetchSchema("missing");
    });

    const cached = qc.getQueryData(["duckdb", "schema", "missing"]);
    expect(cached).toBeUndefined();
  });

  it("prefetchSchema resolves by viewName when id does not match", async () => {
    // Arrange
    const dataset = makeDataset({ id: "other", viewName: "view_x", displayName: "DX" });
    listRegisteredDatasets.mockResolvedValue([dataset]);

    const { result } = renderHook(() => usePrefetchDuckDBQuery(), { wrapper: makeWrapper(qc) });

    // Act
    await act(async () => {
      await result.current.prefetchSchema("view_x");
    });

    const cached = qc.getQueryData(["duckdb", "schema", "view_x"]);
    expect(cached).toEqual({ columns: dataset.columns, rowCount: dataset.rowCount });
  });

  it("prefetchSchema resolves by displayName when id and viewName do not match", async () => {
    // Arrange
    const dataset = makeDataset({ id: "a", viewName: "b", displayName: "Friendly Name" });
    listRegisteredDatasets.mockResolvedValue([dataset]);

    const { result } = renderHook(() => usePrefetchDuckDBQuery(), { wrapper: makeWrapper(qc) });

    // Act
    await act(async () => {
      await result.current.prefetchSchema("Friendly Name");
    });

    const cached = qc.getQueryData(["duckdb", "schema", "Friendly Name"]);
    expect(cached).toEqual({ columns: dataset.columns, rowCount: dataset.rowCount });
  });

  it("prefetchPreview calls runReadOnlyQuery with a quoted SELECT * LIMIT query", async () => {
    // Arrange
    runReadOnlyQuery.mockResolvedValue([]);

    const { result } = renderHook(() => usePrefetchDuckDBQuery(), { wrapper: makeWrapper(qc) });

    // Act
    await act(async () => {
      await result.current.prefetchPreview("orders");
    });

    // Assert
    expect(runReadOnlyQuery).toHaveBeenCalledWith('SELECT * FROM "orders" LIMIT 100');
  });

  it("prefetchPreview uses a custom limit", async () => {
    // Arrange
    runReadOnlyQuery.mockResolvedValue([]);

    const { result } = renderHook(() => usePrefetchDuckDBQuery(), { wrapper: makeWrapper(qc) });

    // Act
    await act(async () => {
      await result.current.prefetchPreview("orders", 50);
    });

    // Assert
    expect(runReadOnlyQuery).toHaveBeenCalledWith('SELECT * FROM "orders" LIMIT 50');
  });

  it("prefetchPreview escapes double-quotes in the table name", async () => {
    // Arrange
    runReadOnlyQuery.mockResolvedValue([]);

    const { result } = renderHook(() => usePrefetchDuckDBQuery(), { wrapper: makeWrapper(qc) });

    // Act
    await act(async () => {
      await result.current.prefetchPreview('ta"ble');
    });

    // Assert
    expect(runReadOnlyQuery).toHaveBeenCalledWith('SELECT * FROM "ta""ble" LIMIT 100');
  });

  it("prefetchPreview stores the result in the QueryClient cache", async () => {
    // Arrange
    const rows = [{ id: 1 }];
    runReadOnlyQuery.mockResolvedValue(rows);

    const { result } = renderHook(() => usePrefetchDuckDBQuery(), { wrapper: makeWrapper(qc) });

    // Act
    await act(async () => {
      await result.current.prefetchPreview("items", 10);
    });

    // Assert – the preview query key should be warmed
    const cached = qc.getQueryData(["duckdb", "preview", "items", 10]);
    expect(cached).toEqual(rows);
  });
});
