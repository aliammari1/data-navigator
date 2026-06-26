import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Boundary mocks ───────────────────────────────────────────────────────────
// generic-overview.ts has exactly TWO IO boundaries against the renderer DuckDB
// channel (a real WASM/native worker in production):
//   - `summarizeRegisteredDataset` — one SUMMARIZE round-trip for per-column stats
//   - `runReadOnlyQuery`           — the auto-chart aggregates (top-N + histogram)
// We mock ONLY those. The `qc` identifier-quoter from telecom/lib/sql is kept
// REAL so the SQL the module actually emits (and its quoting) is exercised
// behaviourally. All classification / scoring / null-math / bucketing logic is
// the real implementation under test.

const summarizeRegisteredDataset =
  vi.fn<(input: { datasetId: string }) => Promise<Record<string, unknown>[]>>();
const runReadOnlyQuery = vi.fn<(sql: string) => Promise<Record<string, unknown>[]>>();

vi.mock("@/platform/duckdb/duckdb", () => ({
  summarizeRegisteredDataset: (input: { datasetId: string }) => summarizeRegisteredDataset(input),
  runReadOnlyQuery: (sql: string) => runReadOnlyQuery(sql),
}));

import { buildGenericOverview } from "@/features/dashboard-home/lib/generic-overview";

// ─── Fixtures / helpers ───────────────────────────────────────────────────────

/** A SUMMARIZE row with sensible, overridable defaults. */
function summRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    column_name: "col",
    column_type: "VARCHAR",
    min: null,
    max: null,
    approx_unique: 0,
    null_percentage: 0,
    avg: null,
    std: null,
    ...overrides,
  };
}

/** Every SQL string passed to the mocked read-only channel, in call order. */
function allSql(): string[] {
  return runReadOnlyQuery.mock.calls.map((c) => String(c[0] ?? ""));
}

/** First SQL whose body matches a substring (the two auto-chart queries differ). */
function sqlMatching(needle: string): string | undefined {
  return allSql().find((s) => s.includes(needle));
}

/**
 * Route the two parallel auto-chart queries by their shape:
 *   - the categorical top-N query selects `AS label` ... `LIMIT 12`
 *   - the histogram query selects `LEAST(` ... `AS bucket`
 * Either may be absent depending on the column mix.
 */
function routeReadOnly(
  topRows: Record<string, unknown>[],
  histRows: Record<string, unknown>[],
): void {
  runReadOnlyQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("AS label")) return topRows;
    if (sql.includes("AS bucket")) return histRows;
    return [];
  });
}

beforeEach(() => {
  // vitest config sets clearMocks+restoreMocks: re-establish safe defaults.
  summarizeRegisteredDataset.mockResolvedValue([]);
  runReadOnlyQuery.mockResolvedValue([]);
});

// ──────────────────────────────────────────────────────────────────────────────
// Empty / degenerate dataset
// ──────────────────────────────────────────────────────────────────────────────

describe("buildGenericOverview — empty dataset", () => {
  it("returns zeroed aggregates and null charts when SUMMARIZE yields no columns", async () => {
    summarizeRegisteredDataset.mockResolvedValue([]);

    const ov = await buildGenericOverview("ds1", "view_ds1", 0);

    expect(ov.rowCount).toBe(0);
    expect(ov.columnCount).toBe(0);
    expect(ov.numericColumnCount).toBe(0);
    expect(ov.temporalColumnCount).toBe(0);
    expect(ov.categoricalColumnCount).toBe(0);
    // No columns → avoids the divide-by-zero branch and returns 0, not NaN.
    expect(ov.avgNullPercentage).toBe(0);
    expect(Number.isNaN(ov.avgNullPercentage)).toBe(false);
    expect(ov.totalNullCells).toBe(0);
    expect(ov.columns).toEqual([]);
    expect(ov.topCategorical).toBeNull();
    expect(ov.numericHistogram).toBeNull();
  });

  it("never issues an auto-chart query when there are no usable columns", async () => {
    summarizeRegisteredDataset.mockResolvedValue([]);

    await buildGenericOverview("ds1", "view_ds1", 0);

    expect(runReadOnlyQuery).not.toHaveBeenCalled();
  });

  it("passes the datasetId straight through to SUMMARIZE", async () => {
    summarizeRegisteredDataset.mockResolvedValue([]);

    await buildGenericOverview("the-id", "view", 5);

    expect(summarizeRegisteredDataset).toHaveBeenCalledWith({ datasetId: "the-id" });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Column mapping + field fallbacks
// ──────────────────────────────────────────────────────────────────────────────

describe("buildGenericOverview — column field mapping", () => {
  it("prefers column_name/column_type but falls back to name/type", async () => {
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({ column_name: "primary", column_type: "BIGINT", name: "ignored", type: "IGNORED" }),
      // canonical fields absent → fall back to the alternate keys
      summRow({ column_name: undefined, column_type: undefined, name: "alt", type: "VARCHAR" }),
    ]);

    const ov = await buildGenericOverview("ds", "v", 0);

    expect(ov.columns[0]?.name).toBe("primary");
    expect(ov.columns[0]?.type).toBe("BIGINT");
    expect(ov.columns[1]?.name).toBe("alt");
    expect(ov.columns[1]?.type).toBe("VARCHAR");
  });

  it("coerces a missing name/type to the empty string", async () => {
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({ column_name: undefined, name: undefined, column_type: undefined, type: undefined }),
    ]);

    const ov = await buildGenericOverview("ds", "v", 0);

    expect(ov.columns[0]?.name).toBe("");
    expect(ov.columns[0]?.type).toBe("");
    // An empty type classifies as "other".
    expect(ov.columns[0]?.role).toBe("other");
  });

  it("parses numeric stats and defaults approx_unique/null_percentage to 0", async () => {
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({
        column_name: "amount",
        column_type: "DOUBLE",
        approx_unique: null,
        null_percentage: undefined,
        avg: 12.5,
        std: 3.25,
        min: 1,
        max: 99,
      }),
    ]);

    const ov = await buildGenericOverview("ds", "v", 0);
    const c = ov.columns[0];

    expect(c?.approxUnique).toBe(0);
    expect(c?.nullPercentage).toBe(0);
    expect(c?.avg).toBeCloseTo(12.5, 6);
    expect(c?.std).toBeCloseTo(3.25, 6);
    // min/max are stringified by toStringOrNull.
    expect(c?.min).toBe("1");
    expect(c?.max).toBe("99");
  });

  it("keeps avg/std null for non-numeric columns whose stats are absent", async () => {
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({ column_type: "VARCHAR", avg: null, std: null, min: "a", max: "z" }),
    ]);

    const ov = await buildGenericOverview("ds", "v", 0);

    expect(ov.columns[0]?.avg).toBeNull();
    expect(ov.columns[0]?.std).toBeNull();
    expect(ov.columns[0]?.min).toBe("a");
    expect(ov.columns[0]?.max).toBe("z");
  });

  it("maps a NULL min/max to null (not the string 'null')", async () => {
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({ min: null, max: null }),
    ]);

    const ov = await buildGenericOverview("ds", "v", 0);

    expect(ov.columns[0]?.min).toBeNull();
    expect(ov.columns[0]?.max).toBeNull();
  });

  it("converts a bigint approx_unique via Number()", async () => {
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({ approx_unique: 1234567890123n }),
    ]);

    const ov = await buildGenericOverview("ds", "v", 0);

    expect(ov.columns[0]?.approxUnique).toBe(1234567890123);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Type classification (classifyType, via roles)
// ──────────────────────────────────────────────────────────────────────────────

describe("buildGenericOverview — type classification", () => {
  it("classifies the numeric family", async () => {
    const numericTypes = [
      "TINYINT",
      "SMALLINT",
      "INTEGER",
      "BIGINT",
      "HUGEINT",
      "UTINYINT",
      "USMALLINT",
      "UINTEGER",
      "UBIGINT",
      "DECIMAL(10,2)",
      "NUMERIC",
      "REAL",
      "FLOAT",
      "DOUBLE",
    ];
    summarizeRegisteredDataset.mockResolvedValue(
      numericTypes.map((t, i) => summRow({ column_name: `n${i}`, column_type: t })),
    );

    const ov = await buildGenericOverview("ds", "v", 0);

    expect(ov.columns.every((c) => c.role === "numeric")).toBe(true);
    expect(ov.numericColumnCount).toBe(numericTypes.length);
  });

  it("classifies the temporal family", async () => {
    const temporal = ["DATE", "TIME", "TIMESTAMP", "TIMESTAMP WITH TIME ZONE", "TIMESTAMP_NS"];
    summarizeRegisteredDataset.mockResolvedValue(
      temporal.map((t, i) => summRow({ column_name: `t${i}`, column_type: t })),
    );

    const ov = await buildGenericOverview("ds", "v", 0);

    expect(ov.columns.every((c) => c.role === "temporal")).toBe(true);
    expect(ov.temporalColumnCount).toBe(temporal.length);
  });

  it("classifies the string/categorical family", async () => {
    const strings = ["VARCHAR", "CHAR", "TEXT", "STRING", "BLOB", "UUID"];
    summarizeRegisteredDataset.mockResolvedValue(
      strings.map((t, i) => summRow({ column_name: `s${i}`, column_type: t })),
    );

    const ov = await buildGenericOverview("ds", "v", 0);

    expect(ov.columns.every((c) => c.role === "categorical")).toBe(true);
    expect(ov.categoricalColumnCount).toBe(strings.length);
  });

  it("classifies unknown types (BOOLEAN, STRUCT, MAP, INTERVAL) as 'other'", async () => {
    const other = ["BOOLEAN", "STRUCT(a INT)", "MAP(VARCHAR, INT)", "INTERVAL"];
    summarizeRegisteredDataset.mockResolvedValue(
      other.map((t, i) => summRow({ column_name: `o${i}`, column_type: t })),
    );

    const ov = await buildGenericOverview("ds", "v", 0);

    expect(ov.columns.every((c) => c.role === "other")).toBe(true);
    // "other" columns count toward columnCount but none of the typed buckets.
    expect(ov.columnCount).toBe(other.length);
    expect(ov.numericColumnCount + ov.temporalColumnCount + ov.categoricalColumnCount).toBe(0);
  });

  it("(BUG) misclassifies an INTEGER[] array column as 'numeric'", async () => {
    // The numeric type regex is prefix-anchored (^) without a trailing word
    // boundary, so a LIST type like "INTEGER[]" (or "BIGINT[]") matches the
    // INTEGER alternative and is treated as a scalar numeric column. Asserting
    // the CURRENT behaviour; this is a real classification bug, not desired.
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({ column_name: "arr", column_type: "INTEGER[]" }),
    ]);

    const ov = await buildGenericOverview("ds", "v", 0);

    expect(ov.columns[0]?.role).toBe("numeric");
    expect(ov.numericColumnCount).toBe(1);
  });

  it("is case-insensitive and tolerant of surrounding whitespace", async () => {
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({ column_name: "a", column_type: "  bigint " }),
      summRow({ column_name: "b", column_type: "varchar" }),
      summRow({ column_name: "c", column_type: "Timestamp" }),
    ]);

    const ov = await buildGenericOverview("ds", "v", 0);

    expect(ov.columns.map((c) => c.role)).toEqual(["numeric", "categorical", "temporal"]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Aggregate math: avgNullPercentage + totalNullCells
// ──────────────────────────────────────────────────────────────────────────────

describe("buildGenericOverview — null aggregates", () => {
  it("averages nullPercentage across columns", async () => {
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({ column_name: "a", null_percentage: 0 }),
      summRow({ column_name: "b", null_percentage: 50 }),
      summRow({ column_name: "c", null_percentage: 100 }),
    ]);

    const ov = await buildGenericOverview("ds", "v", 0);

    expect(ov.avgNullPercentage).toBeCloseTo(50, 6);
  });

  it("computes totalNullCells as a rounded sum of per-column null cells", async () => {
    // 10% of 1000 = 100, 25% of 1000 = 250 → 350 total.
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({ column_name: "a", null_percentage: 10 }),
      summRow({ column_name: "b", null_percentage: 25 }),
    ]);

    const ov = await buildGenericOverview("ds", "v", 1000);

    expect(ov.totalNullCells).toBe(350);
  });

  it("rounds totalNullCells to the nearest integer", async () => {
    // 33.3333...% of 3 rows = 1.0; 50% of 3 = 1.5 → sum 2.5 → round → 3.
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({ column_name: "a", null_percentage: 100 / 3 }),
      summRow({ column_name: "b", null_percentage: 50 }),
    ]);

    const ov = await buildGenericOverview("ds", "v", 3);

    expect(Number.isInteger(ov.totalNullCells)).toBe(true);
    expect(ov.totalNullCells).toBe(3);
  });

  it("yields zero null cells when rowCount is zero regardless of null %", async () => {
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({ column_name: "a", null_percentage: 100 }),
    ]);

    const ov = await buildGenericOverview("ds", "v", 0);

    expect(ov.totalNullCells).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Categorical chart selection (categoricalScore) + top-N fetch
// ──────────────────────────────────────────────────────────────────────────────

describe("buildGenericOverview — categorical chart selection", () => {
  it("selects a moderate-cardinality categorical column and fetches its top values", async () => {
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({ column_name: "region", column_type: "VARCHAR", approx_unique: 8 }),
    ]);
    routeReadOnly(
      [
        { label: "North", cnt: 60 },
        { label: "South", cnt: 40 },
      ],
      [],
    );

    const ov = await buildGenericOverview("ds", "txns", 1000);

    expect(ov.topCategorical).not.toBeNull();
    expect(ov.topCategorical?.column).toBe("region");
    expect(ov.topCategorical?.values).toEqual([
      { label: "North", count: 60 },
      { label: "South", count: 40 },
    ]);
  });

  it("quotes the column name and the view name in the top-N SQL", async () => {
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({ column_name: "region", column_type: "VARCHAR", approx_unique: 8 }),
    ]);
    routeReadOnly([{ label: "x", cnt: 1 }], []);

    await buildGenericOverview("ds", "txns", 1000);
    const sql = sqlMatching("AS label") ?? "";

    expect(sql).toContain('"region"');
    expect(sql).toContain('"txns"');
    expect(sql).toContain("LIMIT 12");
    expect(sql).toContain("IS NOT NULL");
  });

  it("skips a constant categorical column (approxUnique <= 1)", async () => {
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({ column_name: "const_col", column_type: "VARCHAR", approx_unique: 1 }),
    ]);

    const ov = await buildGenericOverview("ds", "txns", 1000);

    expect(ov.topCategorical).toBeNull();
    expect(sqlMatching("AS label")).toBeUndefined();
  });

  it("skips an id-like column whose unique ratio exceeds 0.9", async () => {
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({ column_name: "id", column_type: "VARCHAR", approx_unique: 950 }),
    ]);

    const ov = await buildGenericOverview("ds", "txns", 1000);

    expect(ov.topCategorical).toBeNull();
  });

  it("still considers a high-cardinality (>200) column when its unique ratio is low", async () => {
    // 300 distinct over 100k rows → ratio 0.003 (<0.9) → score 0.1 (>0), eligible.
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({ column_name: "city", column_type: "VARCHAR", approx_unique: 300 }),
    ]);
    routeReadOnly([{ label: "Tunis", cnt: 5 }], []);

    const ov = await buildGenericOverview("ds", "txns", 100_000);

    expect(ov.topCategorical?.column).toBe("city");
  });

  it("prefers the column closest to ~8 categories when several compete", async () => {
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({ column_name: "far", column_type: "VARCHAR", approx_unique: 50 }),
      summRow({ column_name: "near8", column_type: "VARCHAR", approx_unique: 8 }),
      summRow({ column_name: "mid", column_type: "VARCHAR", approx_unique: 20 }),
    ]);
    routeReadOnly([{ label: "a", cnt: 1 }], []);

    const ov = await buildGenericOverview("ds", "txns", 1000);

    expect(ov.topCategorical?.column).toBe("near8");
  });

  it("maps a NULL label in a returned row to the em-dash placeholder", async () => {
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({ column_name: "region", column_type: "VARCHAR", approx_unique: 6 }),
    ]);
    routeReadOnly(
      [
        { label: null, cnt: 3 },
        { label: "South", cnt: 2 },
      ],
      [],
    );

    const ov = await buildGenericOverview("ds", "txns", 100);

    expect(ov.topCategorical?.values[0]).toEqual({ label: "—", count: 3 });
  });

  it("defaults a non-numeric/absent count to 0", async () => {
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({ column_name: "region", column_type: "VARCHAR", approx_unique: 6 }),
    ]);
    routeReadOnly([{ label: "North", cnt: "not-a-number" }], []);

    const ov = await buildGenericOverview("ds", "txns", 100);

    expect(ov.topCategorical?.values[0]).toEqual({ label: "North", count: 0 });
  });

  it("returns null topCategorical when the top-N query comes back empty", async () => {
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({ column_name: "region", column_type: "VARCHAR", approx_unique: 6 }),
    ]);
    routeReadOnly([], []);

    const ov = await buildGenericOverview("ds", "txns", 100);

    expect(ov.topCategorical).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Numeric histogram selection + bucketing (fetchNumericHistogram)
// ──────────────────────────────────────────────────────────────────────────────

describe("buildGenericOverview — numeric histogram", () => {
  it("builds 16 equal-width buckets spanning [min, max]", async () => {
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({ column_name: "amount", column_type: "DOUBLE", min: 0, max: 16 }),
    ]);
    routeReadOnly(
      [],
      [
        { bucket: 0, cnt: 5 },
        { bucket: 15, cnt: 3 },
      ],
    );

    const ov = await buildGenericOverview("ds", "txns", 100);
    const hist = ov.numericHistogram;

    expect(hist).not.toBeNull();
    expect(hist?.column).toBe("amount");
    expect(hist?.buckets).toHaveLength(16);
    // width = 16/16 = 1.
    expect(hist?.buckets[0]).toEqual({ start: 0, end: 1, count: 5 });
    expect(hist?.buckets[15]).toEqual({ start: 15, end: 16, count: 3 });
    // Buckets with no matching row default to count 0.
    expect(hist?.buckets[1]?.count).toBe(0);
  });

  it("places returned counts into the correct bucket index and zero-fills the rest", async () => {
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({ column_name: "x", column_type: "INTEGER", min: 0, max: 160 }),
    ]);
    routeReadOnly(
      [],
      [
        { bucket: 3, cnt: 7 },
        { bucket: 10, cnt: 11 },
      ],
    );

    const ov = await buildGenericOverview("ds", "txns", 100);
    const counts = ov.numericHistogram?.buckets.map((b) => b.count);

    expect(counts).toEqual([0, 0, 0, 7, 0, 0, 0, 0, 0, 0, 11, 0, 0, 0, 0, 0]);
    // width = 160/16 = 10 → bucket 3 spans [30,40).
    expect(ov.numericHistogram?.buckets[3]).toEqual({ start: 30, end: 40, count: 7 });
  });

  it("embeds the column, view, min and computed width in the histogram SQL", async () => {
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({ column_name: "amount", column_type: "DOUBLE", min: 0, max: 32 }),
    ]);
    routeReadOnly([], [{ bucket: 0, cnt: 1 }]);

    await buildGenericOverview("ds", "txns", 100);
    const sql = sqlMatching("AS bucket") ?? "";

    expect(sql).toContain('"amount"');
    expect(sql).toContain('"txns"');
    expect(sql).toContain("LEAST(");
    expect(sql).toContain("15"); // BUCKETS - 1 clamp ceiling
    expect(sql).toContain("/ 2"); // width = 32/16 = 2
    expect(sql).toContain("IS NOT NULL");
  });

  it("returns null when the numeric column has no spread (min === max)", async () => {
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({ column_name: "flat", column_type: "DOUBLE", min: 5, max: 5 }),
    ]);

    const ov = await buildGenericOverview("ds", "txns", 100);

    expect(ov.numericHistogram).toBeNull();
    // No histogram query is even attempted (bestNumeric filtered out earlier).
    expect(sqlMatching("AS bucket")).toBeUndefined();
  });

  it("ignores a numeric column whose min/max are null", async () => {
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({ column_name: "n", column_type: "BIGINT", min: null, max: null }),
    ]);

    const ov = await buildGenericOverview("ds", "txns", 100);

    expect(ov.numericHistogram).toBeNull();
  });

  it("ignores a numeric column whose min/max are non-finite (NaN-like)", async () => {
    // SUMMARIZE could surface 'NaN'/'inf' textual extremes; Number() must be finite.
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({ column_name: "n", column_type: "DOUBLE", min: "NaN", max: "Infinity" }),
    ]);

    const ov = await buildGenericOverview("ds", "txns", 100);

    expect(ov.numericHistogram).toBeNull();
  });

  it("returns null when every histogram bucket is empty", async () => {
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({ column_name: "amount", column_type: "DOUBLE", min: 0, max: 16 }),
    ]);
    // Query ran but produced no rows → all buckets zero → null.
    routeReadOnly([], []);

    const ov = await buildGenericOverview("ds", "txns", 100);

    expect(ov.numericHistogram).toBeNull();
  });

  it("skips bucket rows whose bucket index is null", async () => {
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({ column_name: "amount", column_type: "DOUBLE", min: 0, max: 16 }),
    ]);
    routeReadOnly(
      [],
      [
        { bucket: null, cnt: 999 },
        { bucket: 2, cnt: 4 },
      ],
    );

    const ov = await buildGenericOverview("ds", "txns", 100);
    const counts = ov.numericHistogram?.buckets.map((b) => b.count) ?? [];

    // The null-bucket row is dropped; only bucket 2 carries a count.
    expect(counts[2]).toBe(4);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(4);
  });

  it("selects the FIRST numeric column with spread, skipping an earlier flat one", async () => {
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({ column_name: "flat", column_type: "INTEGER", min: 7, max: 7 }),
      summRow({ column_name: "spread", column_type: "DOUBLE", min: 0, max: 16 }),
    ]);
    routeReadOnly([], [{ bucket: 0, cnt: 1 }]);

    const ov = await buildGenericOverview("ds", "txns", 100);

    expect(ov.numericHistogram?.column).toBe("spread");
  });

  it("handles a negative-to-positive range with fractional bucket boundaries", async () => {
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({ column_name: "delta", column_type: "DOUBLE", min: -8, max: 8 }),
    ]);
    routeReadOnly([], [{ bucket: 8, cnt: 2 }]);

    const ov = await buildGenericOverview("ds", "txns", 100);
    const buckets = ov.numericHistogram?.buckets ?? [];

    // width = 16/16 = 1, so bucket 0 starts at -8 and bucket 8 spans [0,1).
    expect(buckets[0]?.start).toBeCloseTo(-8, 6);
    expect(buckets[8]).toEqual({ start: 0, end: 1, count: 2 });
    expect(buckets[15]?.end).toBeCloseTo(8, 6);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Combined behaviour + parallelism
// ──────────────────────────────────────────────────────────────────────────────

describe("buildGenericOverview — combined", () => {
  it("returns BOTH charts and correct counts for a mixed-type dataset", async () => {
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({ column_name: "amount", column_type: "DOUBLE", min: 0, max: 16, null_percentage: 10 }),
      summRow({ column_name: "region", column_type: "VARCHAR", approx_unique: 8, null_percentage: 0 }),
      summRow({ column_name: "ts", column_type: "TIMESTAMP", null_percentage: 0 }),
      summRow({ column_name: "flags", column_type: "BOOLEAN", null_percentage: 0 }),
    ]);
    routeReadOnly([{ label: "North", cnt: 9 }], [{ bucket: 0, cnt: 4 }]);

    const ov = await buildGenericOverview("ds", "txns", 1000);

    expect(ov.columnCount).toBe(4);
    expect(ov.numericColumnCount).toBe(1);
    expect(ov.temporalColumnCount).toBe(1);
    expect(ov.categoricalColumnCount).toBe(1);
    expect(ov.avgNullPercentage).toBeCloseTo(2.5, 6);
    expect(ov.totalNullCells).toBe(100); // only `amount` 10% of 1000
    expect(ov.topCategorical?.column).toBe("region");
    expect(ov.numericHistogram?.column).toBe("amount");
  });

  it("issues exactly two read-only queries when both charts apply", async () => {
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({ column_name: "amount", column_type: "DOUBLE", min: 0, max: 16 }),
      summRow({ column_name: "region", column_type: "VARCHAR", approx_unique: 8 }),
    ]);
    routeReadOnly([{ label: "North", cnt: 9 }], [{ bucket: 0, cnt: 4 }]);

    await buildGenericOverview("ds", "txns", 1000);

    expect(runReadOnlyQuery).toHaveBeenCalledTimes(2);
  });

  it("issues only the categorical query when there is no usable numeric column", async () => {
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({ column_name: "region", column_type: "VARCHAR", approx_unique: 8 }),
    ]);
    routeReadOnly([{ label: "North", cnt: 9 }], []);

    await buildGenericOverview("ds", "txns", 1000);

    expect(runReadOnlyQuery).toHaveBeenCalledTimes(1);
    expect(sqlMatching("AS label")).toBeDefined();
    expect(sqlMatching("AS bucket")).toBeUndefined();
  });

  it("propagates a rejection from the SUMMARIZE boundary", async () => {
    summarizeRegisteredDataset.mockRejectedValue(new Error("duckdb down"));

    await expect(buildGenericOverview("ds", "txns", 1000)).rejects.toThrow("duckdb down");
  });

  it("propagates a rejection from an auto-chart query", async () => {
    summarizeRegisteredDataset.mockResolvedValue([
      summRow({ column_name: "region", column_type: "VARCHAR", approx_unique: 8 }),
    ]);
    runReadOnlyQuery.mockRejectedValue(new Error("scan failed"));

    await expect(buildGenericOverview("ds", "txns", 1000)).rejects.toThrow("scan failed");
  });
});
