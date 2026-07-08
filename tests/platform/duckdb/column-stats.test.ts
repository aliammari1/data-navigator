import { describe, expect, it, vi } from "vitest";

// ─── Boundary mock ────────────────────────────────────────────────────────────
// fetchColumnStats() calls runReadOnlyQuery from "./duckdb" (the renderer's
// DuckDB IPC client). Mock only that export — quoteIdent is re-exported
// unchanged from the real module so buildColumnStatsSQL's quoting behavior
// stays exactly as tested below.

const h = vi.hoisted(() => ({
  runReadOnlyQuery: vi.fn(),
}));

vi.mock("@/platform/duckdb/duckdb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/platform/duckdb/duckdb")>();
  return { ...actual, runReadOnlyQuery: h.runReadOnlyQuery };
});

// ─── Module under test ────────────────────────────────────────────────────────
// Import AFTER vi.mock() so Vitest applies the mock to fetchColumnStats' import.
import {
  buildColumnStatsSQL,
  fetchColumnStats,
  NUM_BINS,
  type StatColumn,
  TOP_K,
} from "@/platform/duckdb/column-stats";
import type { ColumnInfo } from "@/features/data-formulator/core/types";

const BASE = 'SELECT * FROM "ds_view"';

function col(name: string, type: StatColumn["type"]): StatColumn {
  return { name, type };
}

/** Minimal ColumnInfo for fetchColumnStats — only name/type are read. */
function columnInfo(name: string, type: ColumnInfo["type"]): ColumnInfo {
  return { name, type, dbType: type === "number" ? "DOUBLE" : "VARCHAR" };
}

describe("buildColumnStatsSQL — numeric", () => {
  const { kind, sql } = buildColumnStatsSQL(BASE, col("amount", "number"));

  it("reports the numeric shape", () => {
    expect(kind).toBe("numeric");
  });

  it("wraps the base SQL as the source CTE", () => {
    expect(sql).toContain("WITH __cs_src AS (");
    expect(sql).toContain(BASE);
  });

  it("quotes the column identifier everywhere", () => {
    expect(sql).toContain('approx_count_distinct("amount")');
    expect(sql).toContain('CAST("amount" AS DOUBLE)');
  });

  it("emits a clamped, guarded equi-width bin over a generated series", () => {
    expect(sql).toContain(`range(0, ${NUM_BINS})`);
    expect(sql).toContain(`LEAST(${NUM_BINS - 1}, GREATEST(0, COALESCE(`);
    expect(sql).toContain("NULLIF(a.mx - a.mn, 0)");
    expect(sql).toContain("LEFT JOIN __cs_binned b ON b.bin = g.bin");
  });
});

describe("buildColumnStatsSQL — categorical", () => {
  for (const type of ["string", "date", "boolean", "unknown"] as const) {
    it(`reports the categorical shape for ${type}`, () => {
      expect(buildColumnStatsSQL(BASE, col("status", type)).kind).toBe("categorical");
    });
  }

  const { sql } = buildColumnStatsSQL(BASE, col("status", "string"));

  it("casts to VARCHAR and takes the top-K by frequency", () => {
    expect(sql).toContain('CAST("status" AS VARCHAR) AS value');
    expect(sql).toContain(`LIMIT ${TOP_K}`);
    expect(sql).toContain("ORDER BY cnt DESC, value ASC");
  });

  it("drives from the one-row agg CTE so counts survive an all-null column", () => {
    expect(sql).toContain("FROM __cs_agg a");
    expect(sql).toContain("LEFT JOIN __cs_top t ON TRUE");
  });
});

describe("buildColumnStatsSQL — safety", () => {
  it("doubles embedded quotes in the column name", () => {
    const { sql } = buildColumnStatsSQL(BASE, col('we"ird', "number"));
    expect(sql).toContain('"we""ird"');
  });

  it("strips a trailing semicolon from the base so the CTE body stays open", () => {
    const { sql } = buildColumnStatsSQL('SELECT * FROM "v";', col("x", "number"));
    expect(sql).not.toContain('"v";');
    expect(sql).toContain('SELECT * FROM "v"');
  });
});

// ─── fetchColumnStats — numeric ───────────────────────────────────────────────

describe("fetchColumnStats — numeric", () => {
  it("dispatches to the numeric-shaped query, not categorical, for a number column", async () => {
    h.runReadOnlyQuery.mockResolvedValue([
      { bin: 0, cnt: 1, mn: 0, mx: 10, av: 5, distinct_count: 1, total: 1, nulls: 0 },
    ]);
    const column = columnInfo("amount", "number");

    await fetchColumnStats(BASE, column);

    // Assert against the SQL actually sent to the DB, checking for the numeric
    // shape's own known markers (same ones "buildColumnStatsSQL — numeric"
    // verifies independently above) rather than recomputing buildColumnStatsSQL
    // a second time — a circular check that can't catch fetchColumnStats
    // dispatching to the wrong shape for the given column.type.
    expect(h.runReadOnlyQuery).toHaveBeenCalledTimes(1);
    const sentSql = h.runReadOnlyQuery.mock.calls[0][0] as string;
    expect(sentSql).toContain(BASE);
    expect(sentSql).toContain('approx_count_distinct("amount")');
    expect(sentSql).toContain(`range(0, ${NUM_BINS})`);
    expect(sentSql).not.toContain("ORDER BY cnt DESC, value ASC"); // categorical-only marker
  });

  it("shapes a full 12-bin profile, coercing BIGINT counts to numbers", async () => {
    const counts = [5, 3, 2, 7, 1, 0, 4, 6, 2, 3, 1, 0];
    h.runReadOnlyQuery.mockResolvedValue(
      counts.map((cnt, bin) => ({
        bin,
        cnt: BigInt(cnt),
        mn: 0,
        mx: 120,
        av: 55.25,
        distinct_count: BigInt(15),
        total: BigInt(40),
        nulls: BigInt(6),
      })),
    );

    const stats = await fetchColumnStats(BASE, columnInfo("amount", "number"));

    expect(stats).toEqual({
      kind: "numeric",
      min: 0,
      max: 120,
      avg: 55.25,
      distinct: 15,
      nulls: 6,
      total: 40,
      bins: counts.map((count, i) => ({ lo: i * 10, hi: (i + 1) * 10, count })),
    });
  });

  it("collapses to a single bin spanning the whole range when min === max", async () => {
    h.runReadOnlyQuery.mockResolvedValue([
      { bin: 0, cnt: 9, mn: 42, mx: 42, av: 42, distinct_count: 1, total: 9, nulls: 0 },
    ]);

    const stats = await fetchColumnStats(BASE, columnInfo("flat", "number"));

    expect(stats.kind).toBe("numeric");
    if (stats.kind === "numeric") {
      expect(stats.bins).toEqual([{ lo: 42, hi: 42, count: 9 }]);
      expect(stats.min).toBe(42);
      expect(stats.max).toBe(42);
    }
  });

  it("returns an empty bins array when min/max are null (an all-null numeric column)", async () => {
    h.runReadOnlyQuery.mockResolvedValue([
      { bin: null, cnt: null, mn: null, mx: null, av: null, distinct_count: 0, total: 5, nulls: 5 },
    ]);

    const stats = await fetchColumnStats(BASE, columnInfo("empty", "number"));

    expect(stats.kind).toBe("numeric");
    if (stats.kind === "numeric") {
      expect(stats.min).toBeNull();
      expect(stats.max).toBeNull();
      expect(stats.avg).toBeNull();
      expect(stats.bins).toEqual([]);
      expect(stats.total).toBe(5);
      expect(stats.nulls).toBe(5);
    }
  });

  it("coerces string-encoded aggregate and bin fields", async () => {
    h.runReadOnlyQuery.mockResolvedValue([
      { bin: "0", cnt: "4", mn: "0", mx: "100", av: "50.5", distinct_count: "10", total: "20", nulls: "1" },
      { bin: "1", cnt: "6", mn: "0", mx: "100", av: "50.5", distinct_count: "10", total: "20", nulls: "1" },
    ]);

    const stats = await fetchColumnStats(BASE, columnInfo("stringy", "number"));

    expect(stats.kind).toBe("numeric");
    if (stats.kind === "numeric") {
      expect(stats.min).toBe(0);
      expect(stats.max).toBe(100);
      expect(stats.avg).toBe(50.5);
      expect(stats.distinct).toBe(10);
      expect(stats.total).toBe(20);
      expect(stats.nulls).toBe(1);
      expect(stats.bins[0].count).toBe(4);
      expect(stats.bins[1].count).toBe(6);
      expect(stats.bins).toHaveLength(NUM_BINS);
    }
  });

  it("falls back to a 0 count for a non-numeric bin count field", async () => {
    h.runReadOnlyQuery.mockResolvedValue([
      { bin: 0, cnt: "not-a-number", mn: 0, mx: 10, av: 5, distinct_count: 1, total: 1, nulls: 0 },
    ]);

    const stats = await fetchColumnStats(BASE, columnInfo("bad-cnt", "number"));

    expect(stats.kind).toBe("numeric");
    if (stats.kind === "numeric") {
      expect(stats.bins[0].count).toBe(0);
    }
  });

  it("falls back to a null min when the min field cannot be parsed as a number", async () => {
    h.runReadOnlyQuery.mockResolvedValue([
      { bin: 0, cnt: 0, mn: "not-a-number", mx: 100, av: 50, distinct_count: 1, total: 1, nulls: 0 },
    ]);

    const stats = await fetchColumnStats(BASE, columnInfo("bad-min", "number"));

    expect(stats.kind).toBe("numeric");
    if (stats.kind === "numeric") {
      expect(stats.min).toBeNull();
      // The guard requires BOTH min and max to be non-null to build bins.
      expect(stats.bins).toEqual([]);
    }
  });

  it("falls back to a null min for an empty-string min field (falls through every typed branch)", async () => {
    h.runReadOnlyQuery.mockResolvedValue([
      { bin: 0, cnt: 0, mn: "", mx: 100, av: 50, distinct_count: 1, total: 1, nulls: 0 },
    ]);

    const stats = await fetchColumnStats(BASE, columnInfo("empty-string-min", "number"));

    expect(stats.kind).toBe("numeric");
    if (stats.kind === "numeric") {
      expect(stats.min).toBeNull();
      expect(stats.bins).toEqual([]);
    }
  });

  it("degrades gracefully to nulls/zeros when the query returns zero rows", async () => {
    h.runReadOnlyQuery.mockResolvedValue([]);

    const stats = await fetchColumnStats(BASE, columnInfo("no-rows", "number"));

    expect(stats).toEqual({
      kind: "numeric",
      min: null,
      max: null,
      avg: null,
      distinct: 0,
      nulls: 0,
      total: 0,
      bins: [],
    });
  });

  it("ignores a bin index outside [0, NUM_BINS) instead of throwing", async () => {
    h.runReadOnlyQuery.mockResolvedValue([
      { bin: NUM_BINS, cnt: 99, mn: 0, mx: 10, av: 5, distinct_count: 1, total: 1, nulls: 0 },
    ]);

    const stats = await fetchColumnStats(BASE, columnInfo("out-of-range-bin", "number"));

    expect(stats.kind).toBe("numeric");
    if (stats.kind === "numeric") {
      // The out-of-range bin's count is dropped; every real bin stays at 0.
      expect(stats.bins.every((b) => b.count === 0)).toBe(true);
    }
  });
});

// ─── fetchColumnStats — categorical ───────────────────────────────────────────

describe("fetchColumnStats — categorical", () => {
  it("dispatches to the categorical-shaped query, not numeric, for a string column", async () => {
    h.runReadOnlyQuery.mockResolvedValue([
      { distinct_count: 1, total: 1, nulls: 0, value: "A", cnt: 1 },
    ]);
    const column = columnInfo("status", "string");

    await fetchColumnStats(BASE, column);

    // Same reasoning as the numeric describe above: check the SQL actually sent
    // for this shape's own markers instead of recomputing buildColumnStatsSQL.
    expect(h.runReadOnlyQuery).toHaveBeenCalledTimes(1);
    const sentSql = h.runReadOnlyQuery.mock.calls[0][0] as string;
    expect(sentSql).toContain(BASE);
    expect(sentSql).toContain('CAST("status" AS VARCHAR) AS value');
    expect(sentSql).toContain(`LIMIT ${TOP_K}`);
    expect(sentSql).not.toContain(`range(0, ${NUM_BINS})`); // numeric-only marker
  });

  it("shapes distinct/total/nulls from the first row and collects top values in row order", async () => {
    h.runReadOnlyQuery.mockResolvedValue([
      { distinct_count: BigInt(3), total: BigInt(10), nulls: BigInt(1), value: "A", cnt: BigInt(5) },
      { distinct_count: BigInt(3), total: BigInt(10), nulls: BigInt(1), value: "B", cnt: BigInt(3) },
      { distinct_count: BigInt(3), total: BigInt(10), nulls: BigInt(1), value: "C", cnt: BigInt(1) },
    ]);

    const stats = await fetchColumnStats(BASE, columnInfo("status", "string"));

    expect(stats).toEqual({
      kind: "categorical",
      distinct: 3,
      total: 10,
      nulls: 1,
      top: [
        { value: "A", count: 5 },
        { value: "B", count: 3 },
        { value: "C", count: 1 },
      ],
    });
  });

  it("returns an empty top array when the LEFT JOIN produced no value row (all-null column)", async () => {
    h.runReadOnlyQuery.mockResolvedValue([
      { distinct_count: 0, total: 4, nulls: 4, value: null, cnt: null },
    ]);

    const stats = await fetchColumnStats(BASE, columnInfo("empty", "string"));

    expect(stats.kind).toBe("categorical");
    if (stats.kind === "categorical") {
      expect(stats.top).toEqual([]);
      expect(stats.total).toBe(4);
      expect(stats.nulls).toBe(4);
    }
  });

  it("degrades gracefully to nulls/zeros when the query returns zero rows", async () => {
    h.runReadOnlyQuery.mockResolvedValue([]);

    const stats = await fetchColumnStats(BASE, columnInfo("no-rows", "string"));

    expect(stats).toEqual({ kind: "categorical", distinct: 0, total: 0, nulls: 0, top: [] });
  });

  it("stringifies a non-string value field", async () => {
    h.runReadOnlyQuery.mockResolvedValue([
      { distinct_count: 1, total: 1, nulls: 0, value: 42, cnt: 1 },
    ]);

    const stats = await fetchColumnStats(BASE, columnInfo("numeric-ish", "string"));

    expect(stats.kind).toBe("categorical");
    if (stats.kind === "categorical") {
      expect(stats.top).toEqual([{ value: "42", count: 1 }]);
    }
  });

  it("treats a missing cnt field as a count of 0", async () => {
    h.runReadOnlyQuery.mockResolvedValue([
      { distinct_count: 1, total: 1, nulls: 0, value: "A", cnt: undefined },
    ]);

    const stats = await fetchColumnStats(BASE, columnInfo("missing-cnt", "string"));

    expect(stats.kind).toBe("categorical");
    if (stats.kind === "categorical") {
      expect(stats.top).toEqual([{ value: "A", count: 0 }]);
    }
  });

  it("respects TOP_K when capping the emitted top rows (shape-level: caller LIMITs, shaper trusts row count)", async () => {
    const rows = Array.from({ length: TOP_K }, (_, i) => ({
      distinct_count: TOP_K,
      total: TOP_K,
      nulls: 0,
      value: `v${i}`,
      cnt: TOP_K - i,
    }));
    h.runReadOnlyQuery.mockResolvedValue(rows);

    const stats = await fetchColumnStats(BASE, columnInfo("many", "string"));

    expect(stats.kind).toBe("categorical");
    if (stats.kind === "categorical") {
      expect(stats.top).toHaveLength(TOP_K);
      expect(stats.top[0]).toEqual({ value: "v0", count: TOP_K });
    }
  });
});

// ─── fetchColumnStats — error handling ────────────────────────────────────────

describe("fetchColumnStats — error handling", () => {
  it("rethrows an Error's message from a failed query", async () => {
    h.runReadOnlyQuery.mockRejectedValue(new Error("syntax error near SELECT"));

    await expect(fetchColumnStats(BASE, columnInfo("x", "number"))).rejects.toThrow(
      "syntax error near SELECT",
    );
  });

  it("wraps a non-Error rejection via String(error)", async () => {
    h.runReadOnlyQuery.mockRejectedValue("connection lost");

    await expect(fetchColumnStats(BASE, columnInfo("x", "string"))).rejects.toThrow(
      "connection lost",
    );
  });
});
