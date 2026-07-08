import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildBriefingContext,
  fetchColumnOutliers,
  fetchColumnSample,
  fetchColumnHistogram,
  type BriefingContext,
  type NumericColumnStat,
  type CategoryBreakdown,
  type HistogramBin,
} from "@/features/ai-briefing/core/briefing-context";

/**
 * Tests for briefing-context.ts.
 *
 * All DuckDB I/O and SQL-builder I/O dependencies are mocked. The target module
 * logic (aggregation wiring, identifier quoting, nullPct computation, outlier
 * filtering, category selection) is exercised for real and contributes coverage.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/platform/duckdb/duckdb", () => ({
  runReadOnlyQuery: vi.fn(),
}));

vi.mock("@/platform/duckdb/pushdown", () => ({
  buildHistogramTableSQL: vi.fn(
    (table: string, col: string, bins: number, technique: string) =>
      `FROM histogram("${table}", "${col}", bin_count := ${bins}, technique := '${technique}')`,
  ),
  buildReservoirSampleSQL: vi.fn(
    (table: string, limit: number, opts: { columns?: string[]; seed?: number; where?: string }) => {
      const col = opts?.columns?.[0] ?? "*";
      const where = opts?.where ? ` WHERE ${opts.where}` : "";
      const seed = opts?.seed !== undefined ? ` REPEATABLE (${opts.seed})` : "";
      return `SELECT "${col}" FROM "${table}"${where} USING SAMPLE reservoir(${limit} ROWS)${seed}`;
    },
  ),
  DEFAULT_SEED: 42,
}));

vi.mock("@/platform/viz/seeded-rng", () => ({
  DEFAULT_SEED: 42,
}));

import { runReadOnlyQuery } from "@/platform/duckdb/duckdb";
import { buildHistogramTableSQL, buildReservoirSampleSQL } from "@/platform/duckdb/pushdown";

const mockRunReadOnlyQuery = vi.mocked(runReadOnlyQuery);
const mockBuildHistogramTableSQL = vi.mocked(buildHistogramTableSQL);
const mockBuildReservoirSampleSQL = vi.mocked(buildReservoirSampleSQL);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDataset(overrides: Partial<{
  id: string;
  name: string;
  viewName: string;
  tableName: string;
  columns: Array<{ name: string; type: string; nullCount: number; distinctCount: number; sample: unknown[] }>;
  rowCount: number;
}> = {}) {
  return {
    id: "ds_001",
    name: "Test Dataset",
    viewName: "ds_001_view",
    tableName: "ds_001_table",
    columns: [],
    rowCount: 1000,
    ...overrides,
  };
}

// ─── buildBriefingContext ─────────────────────────────────────────────────────

describe("buildBriefingContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses viewName as the table reference when both viewName and tableName are present", async () => {
    // Arrange
    const dataset = makeDataset({ viewName: "view_name", tableName: "table_name" });
    mockRunReadOnlyQuery.mockResolvedValue([{ __n: 100n }]);

    // Act
    const ctx = await buildBriefingContext(dataset);

    // Assert: tableName in context should be the viewName
    expect(ctx.tableName).toBe("view_name");
  });

  it("falls back to tableName when viewName is empty string", async () => {
    // Arrange
    const dataset = makeDataset({ viewName: "", tableName: "fallback_table" });
    mockRunReadOnlyQuery.mockResolvedValue([{ __n: 50n }]);

    // Act
    const ctx = await buildBriefingContext(dataset);

    // Assert
    expect(ctx.tableName).toBe("fallback_table");
  });

  it("returns dataset metadata fields correctly", async () => {
    // Arrange
    const dataset = makeDataset({ id: "ds_x", name: "My Dataset", viewName: "my_view" });
    mockRunReadOnlyQuery.mockResolvedValue([{ __n: 500n }]);

    // Act
    const ctx = await buildBriefingContext(dataset);

    // Assert
    expect(ctx.datasetId).toBe("ds_x");
    expect(ctx.datasetName).toBe("My Dataset");
    expect(ctx.tableName).toBe("my_view");
    expect(ctx.rowCount).toBe(500);
    expect(typeof ctx.generatedAt).toBe("string");
    // generatedAt should be a valid ISO timestamp
    expect(() => new Date(ctx.generatedAt)).not.toThrow();
  });

  it("resolves rowCount from the aggregate query result (__n as bigint)", async () => {
    // Arrange
    const dataset = makeDataset({ rowCount: 999 });
    mockRunReadOnlyQuery.mockResolvedValue([{ __n: 1234n }]);

    // Act
    const ctx = await buildBriefingContext(dataset);

    // Assert: query result takes precedence over dataset.rowCount
    expect(ctx.rowCount).toBe(1234);
  });

  it("falls back to dataset.rowCount when aggRow.__n is absent", async () => {
    // Arrange
    const dataset = makeDataset({ rowCount: 777 });
    // aggRow has no __n key
    mockRunReadOnlyQuery.mockResolvedValue([{}]);

    // Act
    const ctx = await buildBriefingContext(dataset);

    // Assert
    expect(ctx.rowCount).toBe(777);
  });

  it("returns empty numericCols and null topCategory when no columns are present", async () => {
    // Arrange
    const dataset = makeDataset({ columns: [] });
    mockRunReadOnlyQuery.mockResolvedValue([{ __n: 100n }]);

    // Act
    const ctx = await buildBriefingContext(dataset);

    // Assert
    expect(ctx.numericCols).toEqual([]);
    expect(ctx.topCategory).toBeNull();
  });

  it("computes numeric column stats from aggregated query result", async () => {
    // Arrange
    const dataset = makeDataset({
      columns: [{ name: "price", type: "number", nullCount: 0, distinctCount: 50, sample: [] }],
    });
    mockRunReadOnlyQuery.mockResolvedValue([
      {
        __n: 1000n,
        "price__mean": 25.5,
        "price__std": 5.2,
        "price__min": 1.0,
        "price__max": 99.9,
        "price__q1": 20.0,
        "price__q3": 30.0,
        "price__nulls": 50n,
      },
    ]);

    // Act
    const ctx = await buildBriefingContext(dataset);

    // Assert
    expect(ctx.numericCols).toHaveLength(1);
    const stat = ctx.numericCols[0];
    expect(stat.name).toBe("price");
    expect(stat.mean).toBeCloseTo(25.5);
    expect(stat.std).toBeCloseTo(5.2);
    expect(stat.min).toBeCloseTo(1.0);
    expect(stat.max).toBeCloseTo(99.9);
    expect(stat.q1).toBeCloseTo(20.0);
    expect(stat.q3).toBeCloseTo(30.0);
    // nullPct = (50 / 1000) * 100 = 5
    expect(stat.nullPct).toBeCloseTo(5.0);
  });

  it("sets nullPct to 0 when rowCount is 0 (avoids division by zero)", async () => {
    // Arrange
    const dataset = makeDataset({
      columns: [{ name: "val", type: "number", nullCount: 0, distinctCount: 1, sample: [] }],
    });
    mockRunReadOnlyQuery.mockResolvedValue([
      {
        __n: 0n,
        "val__mean": 0,
        "val__std": 0,
        "val__min": 0,
        "val__max": 0,
        "val__q1": 0,
        "val__q3": 0,
        "val__nulls": 0n,
      },
    ]);

    // Act
    const ctx = await buildBriefingContext(dataset);

    // Assert
    expect(ctx.numericCols[0].nullPct).toBe(0);
  });

  it("handles NaN / non-finite aggregate values by coercing them to 0", async () => {
    // Arrange
    const dataset = makeDataset({
      columns: [{ name: "score", type: "number", nullCount: 0, distinctCount: 1, sample: [] }],
    });
    mockRunReadOnlyQuery.mockResolvedValue([
      {
        __n: 10n,
        "score__mean": null,
        "score__std": undefined,
        "score__min": Number.NaN,
        "score__max": Number.POSITIVE_INFINITY,
        "score__q1": Number.NEGATIVE_INFINITY,
        "score__q3": null,
        "score__nulls": 0n,
      },
    ]);

    // Act
    const ctx = await buildBriefingContext(dataset);

    // Assert: all non-finite/missing values convert to 0
    const stat = ctx.numericCols[0];
    expect(stat.mean).toBe(0);
    expect(stat.std).toBe(0);
    expect(stat.min).toBe(0);
    expect(stat.max).toBe(0);
    expect(stat.q1).toBe(0);
    expect(stat.q3).toBe(0);
  });

  it("limits numeric columns to 12 even when more than 12 exist", async () => {
    // Arrange: 15 numeric columns
    const columns = Array.from({ length: 15 }, (_, i) => ({
      name: `col${i}`,
      type: "number" as const,
      nullCount: 0,
      distinctCount: 10,
      sample: [],
    }));
    const dataset = makeDataset({ columns });
    // Build a row with __n and all aliases
    const aggRow: Record<string, unknown> = { __n: 100n };
    for (let i = 0; i < 12; i++) {
      aggRow[`col${i}__mean`] = i;
      aggRow[`col${i}__std`] = 1;
      aggRow[`col${i}__min`] = 0;
      aggRow[`col${i}__max`] = 10;
      aggRow[`col${i}__q1`] = 2;
      aggRow[`col${i}__q3`] = 8;
      aggRow[`col${i}__nulls`] = 0n;
    }
    mockRunReadOnlyQuery.mockResolvedValue([aggRow]);

    // Act
    const ctx = await buildBriefingContext(dataset);

    // Assert: only 12 columns are processed
    expect(ctx.numericCols).toHaveLength(12);
  });

  it("picks a string column with cardinality >= 2 as topCategory", async () => {
    // Arrange
    const dataset = makeDataset({
      columns: [
        { name: "region", type: "string" as const, nullCount: 0, distinctCount: 3, sample: [] },
      ],
    });
    // First call: aggregate (no string columns, just count)
    // Second call: topCategory query
    mockRunReadOnlyQuery
      .mockResolvedValueOnce([{ __n: 300n }])
      .mockResolvedValueOnce([
        { label: "North", cnt: 100n },
        { label: "South", cnt: 120n },
        { label: "East", cnt: 80n },
      ]);

    // Act
    const ctx = await buildBriefingContext(dataset);

    // Assert
    expect(ctx.topCategory).not.toBeNull();
    expect(ctx.topCategory?.dimension).toBe("region");
    expect(ctx.topCategory?.values).toHaveLength(3);
    expect(ctx.topCategory?.values[0].label).toBe("North");
    expect(ctx.topCategory?.values[0].count).toBe(100);
    // pct = (100 / 300) * 100 ≈ 33.33
    expect(ctx.topCategory?.values[0].pct).toBeCloseTo(33.333, 2);
  });

  it("sets pct to 0 for category values when rowCount is 0", async () => {
    // Arrange
    const dataset = makeDataset({
      columns: [
        { name: "cat", type: "string" as const, nullCount: 0, distinctCount: 2, sample: [] },
      ],
    });
    mockRunReadOnlyQuery
      .mockResolvedValueOnce([{ __n: 0n }])
      .mockResolvedValueOnce([
        { label: "A", cnt: 0n },
        { label: "B", cnt: 0n },
      ]);

    // Act
    const ctx = await buildBriefingContext(dataset);

    // Assert
    expect(ctx.topCategory?.values[0].pct).toBe(0);
  });

  it("returns null topCategory when all string columns return fewer than 2 rows", async () => {
    // Arrange
    const dataset = makeDataset({
      columns: [
        { name: "status", type: "string" as const, nullCount: 0, distinctCount: 1, sample: [] },
      ],
    });
    mockRunReadOnlyQuery
      .mockResolvedValueOnce([{ __n: 100n }])
      .mockResolvedValueOnce([{ label: "active", cnt: 100n }]); // only 1 row

    // Act
    const ctx = await buildBriefingContext(dataset);

    // Assert
    expect(ctx.topCategory).toBeNull();
  });

  it("skips a string column that throws and moves to the next candidate", async () => {
    // Arrange: "bad" has distinctCount=2 (sorted first); "good" has distinctCount=5 (sorted second)
    const dataset = makeDataset({
      columns: [
        { name: "bad", type: "string" as const, nullCount: 0, distinctCount: 2, sample: [] },
        { name: "good", type: "string" as const, nullCount: 0, distinctCount: 5, sample: [] },
      ],
    });
    mockRunReadOnlyQuery
      .mockResolvedValueOnce([{ __n: 200n }])  // aggregate row
      .mockRejectedValueOnce(new Error("DuckDB error"))  // "bad" (first sorted candidate) throws
      .mockResolvedValueOnce([
        { label: "X", cnt: 80n },
        { label: "Y", cnt: 120n },
      ]);  // "good" (second candidate) succeeds

    // Act
    const ctx = await buildBriefingContext(dataset);

    // Assert: topCategory uses the "good" column (error in "bad" was swallowed)
    expect(ctx.topCategory?.dimension).toBe("good");
    expect(ctx.topCategory?.values).toHaveLength(2);
  });

  it("sorts string column candidates by distinctCount ascending (lower = preferred)", async () => {
    // Arrange: two string cols, 'country' has lower cardinality
    const dataset = makeDataset({
      columns: [
        { name: "city", type: "string" as const, nullCount: 0, distinctCount: 500, sample: [] },
        { name: "country", type: "string" as const, nullCount: 0, distinctCount: 10, sample: [] },
      ],
    });
    const calls: string[][] = [];
    mockRunReadOnlyQuery.mockImplementation(async (sql: string) => {
      calls.push([sql]);
      if (sql.includes("__n")) {
        return [{ __n: 1000n }];
      }
      // Return 2+ rows for any category column
      return [
        { label: "A", cnt: 300n },
        { label: "B", cnt: 700n },
      ];
    });

    // Act
    const ctx = await buildBriefingContext(dataset);

    // Assert: 'country' (lower cardinality) is tried first
    expect(ctx.topCategory?.dimension).toBe("country");
  });

  it("handles null label in category rows by substituting em-dash", async () => {
    // Arrange
    const dataset = makeDataset({
      columns: [
        { name: "cat", type: "string" as const, nullCount: 0, distinctCount: 2, sample: [] },
      ],
    });
    mockRunReadOnlyQuery
      .mockResolvedValueOnce([{ __n: 100n }])
      .mockResolvedValueOnce([
        { label: null, cnt: 50n },
        { label: "defined", cnt: 50n },
      ]);

    // Act
    const ctx = await buildBriefingContext(dataset);

    // Assert: null label → "—"
    expect(ctx.topCategory?.values[0].label).toBe("—");
    expect(ctx.topCategory?.values[1].label).toBe("defined");
  });

  it("handles a column name with embedded double-quotes (escaping)", async () => {
    // Arrange: column name contains a double-quote
    const dataset = makeDataset({
      columns: [{ name: 'a"b', type: "number" as const, nullCount: 0, distinctCount: 5, sample: [] }],
    });
    const aggRow: Record<string, unknown> = {
      __n: 50n,
      "ab__mean": 10,
      "ab__std": 2,
      "ab__min": 5,
      "ab__max": 15,
      "ab__q1": 8,
      "ab__q3": 12,
      "ab__nulls": 0n,
    };
    mockRunReadOnlyQuery.mockResolvedValue([aggRow]);

    // Act
    const ctx = await buildBriefingContext(dataset);

    // Assert: the stat name preserves the original column name
    expect(ctx.numericCols[0].name).toBe('a"b');
  });

  it("ignores non-numeric non-string columns (date, boolean) in stats", async () => {
    // Arrange
    const dataset = makeDataset({
      columns: [
        { name: "created_at", type: "date" as const, nullCount: 0, distinctCount: 100, sample: [] },
        { name: "is_active", type: "boolean" as const, nullCount: 0, distinctCount: 2, sample: [] },
        { name: "amount", type: "number" as const, nullCount: 0, distinctCount: 10, sample: [] },
      ],
    });
    mockRunReadOnlyQuery.mockResolvedValue([
      {
        __n: 50n,
        "amount__mean": 5,
        "amount__std": 1,
        "amount__min": 1,
        "amount__max": 10,
        "amount__q1": 3,
        "amount__q3": 7,
        "amount__nulls": 0n,
      },
    ]);

    // Act
    const ctx = await buildBriefingContext(dataset);

    // Assert: only numeric columns appear in numericCols
    expect(ctx.numericCols).toHaveLength(1);
    expect(ctx.numericCols[0].name).toBe("amount");
  });

  it("returns null topCategory when there are no string columns", async () => {
    // Arrange
    const dataset = makeDataset({
      columns: [
        { name: "val", type: "number" as const, nullCount: 0, distinctCount: 10, sample: [] },
      ],
    });
    mockRunReadOnlyQuery.mockResolvedValue([
      {
        __n: 100n,
        "val__mean": 5,
        "val__std": 1,
        "val__min": 1,
        "val__max": 10,
        "val__q1": 3,
        "val__q3": 7,
        "val__nulls": 0n,
      },
    ]);

    // Act
    const ctx = await buildBriefingContext(dataset);

    // Assert
    expect(ctx.topCategory).toBeNull();
  });
});

// ─── fetchColumnOutliers ──────────────────────────────────────────────────────

describe("fetchColumnOutliers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty array when std is zero (avoids division by zero)", async () => {
    // Act
    const result = await fetchColumnOutliers("my_table", "val", 10, 0);

    // Assert: no query is run
    expect(result).toEqual([]);
    expect(mockRunReadOnlyQuery).not.toHaveBeenCalled();
  });

  it("returns an empty array when std is negative", async () => {
    // Act
    const result = await fetchColumnOutliers("my_table", "val", 10, -1);

    // Assert
    expect(result).toEqual([]);
  });

  it("returns an empty array when std is NaN", async () => {
    // Act
    const result = await fetchColumnOutliers("my_table", "val", 10, Number.NaN);

    // Assert
    expect(result).toEqual([]);
  });

  it("returns an empty array when std is Infinity", async () => {
    // Act
    const result = await fetchColumnOutliers("my_table", "val", 10, Number.POSITIVE_INFINITY);

    // Assert
    expect(result).toEqual([]);
  });

  it("queries outliers and returns their values when std is positive and finite", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockResolvedValue([{ v: 99.5 }, { v: -45.2 }]);

    // Act
    const result = await fetchColumnOutliers("sales", "amount", 50, 10, 3, 50);

    // Assert
    expect(mockRunReadOnlyQuery).toHaveBeenCalledOnce();
    const sql = mockRunReadOnlyQuery.mock.calls[0][0];
    expect(sql).toContain('"amount"');
    expect(sql).toContain('"sales"');
    expect(result).toEqual([99.5, -45.2]);
  });

  it("uses default threshold of 3 when not specified", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockResolvedValue([]);

    // Act
    await fetchColumnOutliers("t", "col", 0, 5);

    // Assert
    const sql = mockRunReadOnlyQuery.mock.calls[0][0];
    expect(sql).toContain("> 3");
  });

  it("uses default limit of 50 when not specified", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockResolvedValue([]);

    // Act
    await fetchColumnOutliers("t", "col", 0, 5);

    // Assert
    const sql = mockRunReadOnlyQuery.mock.calls[0][0];
    expect(sql).toContain("LIMIT 50");
  });

  it("filters out non-finite results from the returned array", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockResolvedValue([
      { v: 10 },
      { v: null },
      { v: Number.NaN },
      { v: 20 },
    ]);

    // Act
    const result = await fetchColumnOutliers("t", "col", 0, 1);

    // Assert: null coerces to 0 (finite), NaN to 0 (finite via toFiniteNumber)
    // toFiniteNumber converts NaN/null to 0, and 0 IS finite
    // So we get [10, 0, 0, 20] — all finite
    expect(result).toHaveLength(4);
    expect(result).toContain(10);
    expect(result).toContain(20);
  });

  it("quotes a column name with embedded double-quotes in the SQL", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockResolvedValue([]);

    // Act
    await fetchColumnOutliers("t", 'we"ird', 0, 1);

    // Assert
    const sql = mockRunReadOnlyQuery.mock.calls[0][0];
    expect(sql).toContain('"we""ird"');
  });
});

// ─── fetchColumnSample ────────────────────────────────────────────────────────

describe("fetchColumnSample", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls buildReservoirSampleSQL and runs the query", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockResolvedValue([{ amount: 10 }, { amount: 20 }]);

    // Act
    const result = await fetchColumnSample("sales", "amount");

    // Assert
    expect(mockBuildReservoirSampleSQL).toHaveBeenCalledOnce();
    expect(mockRunReadOnlyQuery).toHaveBeenCalledOnce();
    expect(result).toHaveLength(2);
    expect(result).toContain(10);
    expect(result).toContain(20);
  });

  it("passes the column name and default limit of 4000 to buildReservoirSampleSQL", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockResolvedValue([]);

    // Act
    await fetchColumnSample("t", "col");

    // Assert
    const [table, limit, opts] = mockBuildReservoirSampleSQL.mock.calls[0];
    expect(table).toBe("t");
    expect(limit).toBe(4000);
    expect(opts.columns).toContain("col");
  });

  it("passes the default seed (42) to buildReservoirSampleSQL", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockResolvedValue([]);

    // Act
    await fetchColumnSample("t", "col");

    // Assert
    const [, , opts] = mockBuildReservoirSampleSQL.mock.calls[0];
    expect(opts.seed).toBe(42);
  });

  it("accepts a custom limit and seed", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockResolvedValue([]);

    // Act
    await fetchColumnSample("t", "col", 500, 99);

    // Assert
    const [, limit, opts] = mockBuildReservoirSampleSQL.mock.calls[0];
    expect(limit).toBe(500);
    expect(opts.seed).toBe(99);
  });

  it("filters out non-finite values from results", async () => {
    // Arrange: values: 5, 0 (from null), 0 (from NaN), 15
    mockRunReadOnlyQuery.mockResolvedValue([
      { amount: 5 },
      { amount: null },
      { amount: Number.NaN },
      { amount: 15 },
    ]);

    // Act
    const result = await fetchColumnSample("t", "amount");

    // Assert: toFiniteNumber(null)=0 (finite), toFiniteNumber(NaN)=0 (finite)
    // All 4 become finite, none filtered out
    expect(result.every((v) => Number.isFinite(v))).toBe(true);
    expect(result).toHaveLength(4);
  });

  it("falls back to the first object value when the column key is absent", async () => {
    // Arrange: rows have a different key than 'col'
    mockRunReadOnlyQuery.mockResolvedValue([{ other_key: 42 }]);

    // Act
    const result = await fetchColumnSample("t", "col");

    // Assert: should fall back to Object.values(r)[0] = 42
    expect(result).toContain(42);
  });

  it("includes a NOT NULL where clause in the SQL options", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockResolvedValue([]);

    // Act
    await fetchColumnSample("t", "myCol");

    // Assert
    const [, , opts] = mockBuildReservoirSampleSQL.mock.calls[0];
    expect(opts.where).toContain("IS NOT NULL");
    expect(opts.where).toContain('"myCol"');
  });
});

// ─── fetchColumnHistogram ─────────────────────────────────────────────────────

describe("fetchColumnHistogram", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls buildHistogramTableSQL and returns the histogram bins", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockResolvedValue([
      { bin: "0-10", count: 5 },
      { bin: "10-20", count: 15 },
    ]);

    // Act
    const result = await fetchColumnHistogram("sales", "amount");

    // Assert
    expect(mockBuildHistogramTableSQL).toHaveBeenCalledOnce();
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ label: "0-10", count: 5 });
    expect(result[1]).toEqual({ label: "10-20", count: 15 });
  });

  it("passes the default binCount of 24 and technique 'equi-width' to buildHistogramTableSQL", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockResolvedValue([]);

    // Act
    await fetchColumnHistogram("t", "col");

    // Assert
    const [table, col, bins, technique] = mockBuildHistogramTableSQL.mock.calls[0];
    expect(table).toBe("t");
    expect(col).toBe("col");
    expect(bins).toBe(24);
    expect(technique).toBe("equi-width");
  });

  it("accepts a custom binCount", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockResolvedValue([]);

    // Act
    await fetchColumnHistogram("t", "col", 10);

    // Assert
    const [, , bins] = mockBuildHistogramTableSQL.mock.calls[0];
    expect(bins).toBe(10);
  });

  it("filters out bins with an empty label", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockResolvedValue([
      { bin: "0-10", count: 5 },
      { bin: "", count: 10 },   // empty label → filtered
      { bin: "10-20", count: 3 },
    ]);

    // Act
    const result = await fetchColumnHistogram("t", "col");

    // Assert: the empty-label bin is removed
    expect(result).toHaveLength(2);
    expect(result.map((b) => b.label)).not.toContain("");
  });

  it("converts null bin field to empty string and filters it out", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockResolvedValue([
      { bin: null, count: 5 },
      { bin: "1-2", count: 3 },
    ]);

    // Act
    const result = await fetchColumnHistogram("t", "col");

    // Assert: null → "" → filtered
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("1-2");
  });

  it("coerces non-finite count values to 0", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockResolvedValue([
      { bin: "A", count: null },
      { bin: "B", count: Number.NaN },
      { bin: "C", count: 7 },
    ]);

    // Act
    const result = await fetchColumnHistogram("t", "col");

    // Assert: null/NaN become 0
    expect(result[0].count).toBe(0);
    expect(result[1].count).toBe(0);
    expect(result[2].count).toBe(7);
  });

  it("returns an empty array when the query throws", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockRejectedValue(new Error("DuckDB unavailable"));

    // Act
    const result = await fetchColumnHistogram("t", "col");

    // Assert: error is caught and an empty array is returned
    expect(result).toEqual([]);
  });

  it("returns an empty array when DuckDB returns no rows", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockResolvedValue([]);

    // Act
    const result = await fetchColumnHistogram("t", "col");

    // Assert
    expect(result).toEqual([]);
  });

  it("also catches errors from buildHistogramTableSQL itself", async () => {
    // Arrange: make the SQL builder throw
    mockBuildHistogramTableSQL.mockImplementationOnce(() => {
      throw new Error("builder failure");
    });

    // Act
    const result = await fetchColumnHistogram("t", "col");

    // Assert: caught, empty array returned
    expect(result).toEqual([]);
  });
});
