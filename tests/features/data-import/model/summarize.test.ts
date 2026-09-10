import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchFullTableColumnInfo,
  mapDuckTypeToColumnInfoType,
  summarizeRowsToColumnInfo,
} from "@/features/data-import/model/summarize";
import { duckdbClient } from "@/platform/duckdb/duckdb-client";

/**
 * Unit tests for src/features/data-import/model/summarize.ts.
 *
 * Covers all branches including the asString("") → undefined path (line 41)
 * that the top-level summarize.test.ts leaves uncovered.
 */

vi.mock("@/platform/duckdb/duckdb-client", () => ({
  duckdbClient: {
    summarizeDataset: vi.fn(),
  },
}));

const summarizeDatasetMock = vi.mocked(duckdbClient.summarizeDataset);

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── mapDuckTypeToColumnInfoType ──────────────────────────────────────────────

describe("mapDuckTypeToColumnInfoType", () => {
  it.each([
    "INTEGER",
    "BIGINT",
    "TINYINT",
    "DOUBLE",
    "FLOAT",
    "DECIMAL(10,2)",
    "NUMERIC",
    "REAL",
    "HUGEINT",
    "UINTEGER",
    "UBIGINT",
  ])("maps %s to number", (duckType) => {
    expect(mapDuckTypeToColumnInfoType(duckType)).toBe("number");
  });

  it.each([
    "DATE",
    "TIMESTAMP",
    "TIMESTAMP WITH TIME ZONE",
    "TIME",
  ])("maps %s to date", (duckType) => {
    expect(mapDuckTypeToColumnInfoType(duckType)).toBe("date");
  });

  it.each(["BOOLEAN", "BOOL"])("maps %s to boolean", (duckType) => {
    expect(mapDuckTypeToColumnInfoType(duckType)).toBe("boolean");
  });

  it("honours the 'mixed' sentinel from the preview path", () => {
    expect(mapDuckTypeToColumnInfoType("mixed")).toBe("mixed");
  });

  it("falls back to string for VARCHAR and unknown types", () => {
    expect(mapDuckTypeToColumnInfoType("VARCHAR")).toBe("string");
    expect(mapDuckTypeToColumnInfoType("BLOB")).toBe("string");
    expect(mapDuckTypeToColumnInfoType("JSON")).toBe("string");
  });

  it("is case-insensitive", () => {
    expect(mapDuckTypeToColumnInfoType("integer")).toBe("number");
    expect(mapDuckTypeToColumnInfoType("Date")).toBe("date");
  });
});

// ─── summarizeRowsToColumnInfo ────────────────────────────────────────────────

describe("summarizeRowsToColumnInfo", () => {
  it("returns an empty array for no rows", () => {
    expect(summarizeRowsToColumnInfo([], 100, new Map())).toEqual([]);
  });

  it("maps a numeric column with full-table stats", () => {
    const rows = [
      {
        column_name: "amount",
        column_type: "DOUBLE",
        min: "1.5",
        max: "99.5",
        approx_unique: 80n,
        avg: "50.25",
        null_percentage: "10%",
      },
    ];

    const [col] = summarizeRowsToColumnInfo(rows, 1000, new Map());

    expect(col.name).toBe("amount");
    expect(col.type).toBe("number");
    expect(col.min).toBe(1.5);
    expect(col.max).toBe(99.5);
    expect(col.avg).toBeCloseTo(50.25);
    expect(col.uniqueCount).toBe(80);
    expect(col.nullRate).toBeCloseTo(0.1);
    expect(col.nullCount).toBe(100);
  });

  it("keeps min/max as strings for non-numeric columns and omits avg", () => {
    const rows = [
      {
        column_name: "city",
        column_type: "VARCHAR",
        min: "Alger",
        max: "Oran",
        approx_unique: 5,
        avg: "ignored",
        null_percentage: 0,
      },
    ];

    const [col] = summarizeRowsToColumnInfo(rows, 50, new Map());

    expect(col.type).toBe("string");
    expect(col.min).toBe("Alger");
    expect(col.max).toBe("Oran");
    expect(col.avg).toBeUndefined();
    expect(col.nullRate).toBe(0);
    expect(col.nullCount).toBe(0);
  });

  it("attaches preview sample values by column name", () => {
    const rows = [{ column_name: "region", column_type: "VARCHAR", approx_unique: 3 }];
    const samples = new Map<string, unknown[]>([["region", ["N", "S", "E"]]]);

    const [col] = summarizeRowsToColumnInfo(rows, 10, samples);

    expect(col.sampleValues).toEqual(["N", "S", "E"]);
  });

  it("defaults sample values to an empty array when none are provided", () => {
    const rows = [{ column_name: "x", column_type: "INTEGER", approx_unique: 1 }];

    const [col] = summarizeRowsToColumnInfo(rows, 10, new Map());

    expect(col.sampleValues).toEqual([]);
  });

  it("defaults a missing column name to an empty string and missing type to VARCHAR/string", () => {
    const rows = [{ approx_unique: 1 }];

    const [col] = summarizeRowsToColumnInfo(rows, 10, new Map());

    expect(col.name).toBe("");
    expect(col.type).toBe("string");
  });

  it("treats an empty-string numeric summary field as missing (uniqueCount falls back to 0)", () => {
    const rows = [
      {
        column_name: "n",
        column_type: "INTEGER",
        approx_unique: "",
        min: "",
        max: "",
        avg: "",
        null_percentage: 0,
      },
    ];

    const [col] = summarizeRowsToColumnInfo(rows, 10, new Map());

    expect(col.uniqueCount).toBe(0);
    expect(col.min).toBeUndefined();
    expect(col.max).toBeUndefined();
    expect(col.avg).toBeUndefined();
  });

  it("clamps a negative rowCount to 0 when computing nullCount", () => {
    const rows = [
      {
        column_name: "n",
        column_type: "INTEGER",
        approx_unique: 1,
        null_percentage: 50,
      },
    ];

    const [col] = summarizeRowsToColumnInfo(rows, -100, new Map());

    expect(col.nullCount).toBe(0);
    expect(col.nullRate).toBe(0.5);
  });

  it("round-trips a large bigint approx_unique", () => {
    const rows = [
      {
        column_name: "id",
        column_type: "BIGINT",
        approx_unique: 5000000000n,
        null_percentage: 0,
      },
    ];

    const [col] = summarizeRowsToColumnInfo(rows, 5000000000, new Map());

    expect(col.uniqueCount).toBe(5000000000);
  });

  // ── Branch: asString returns undefined for empty-string column_name (line 41) ──

  it("treats an empty-string column_name as missing, falling back to empty string name", () => {
    // Arrange: column_name is explicitly the empty string "".
    // asString("") hits the `text.length > 0 ? text : undefined` false branch.
    // The nullish-coalescing fallback `?? ""` then gives the name field "".
    const rows = [
      {
        column_name: "",
        column_type: "VARCHAR",
        approx_unique: 2,
        null_percentage: 0,
      },
    ];

    // Act
    const [col] = summarizeRowsToColumnInfo(rows, 10, new Map());

    // Assert
    expect(col.name).toBe("");
    expect(col.type).toBe("string");
  });

  it("treats an empty-string column_type as missing, defaulting type to string (VARCHAR fallback)", () => {
    // Arrange: column_type is explicitly "" — asString("") returns undefined,
    // so duckType falls back to "VARCHAR" and type becomes "string".
    const rows = [
      {
        column_name: "col_a",
        column_type: "",
        approx_unique: 1,
        null_percentage: 0,
      },
    ];

    // Act
    const [col] = summarizeRowsToColumnInfo(rows, 10, new Map());

    // Assert
    expect(col.name).toBe("col_a");
    expect(col.type).toBe("string");
  });

  it("treats an empty-string min/max for a string column as undefined", () => {
    // Arrange: a non-numeric column where min/max are empty strings.
    // asString("") → undefined so both min and max end up undefined.
    const rows = [
      {
        column_name: "label",
        column_type: "VARCHAR",
        min: "",
        max: "",
        approx_unique: 3,
        null_percentage: 0,
      },
    ];

    // Act
    const [col] = summarizeRowsToColumnInfo(rows, 20, new Map());

    // Assert
    expect(col.min).toBeUndefined();
    expect(col.max).toBeUndefined();
  });

  it("handles null column_name gracefully, falling back to empty string", () => {
    // asString(null) → returns undefined via the null/undefined guard at line 39,
    // then the ?? "" fallback applies.
    const rows = [
      {
        column_name: null,
        column_type: "VARCHAR",
        approx_unique: 1,
        null_percentage: 0,
      },
    ];

    const [col] = summarizeRowsToColumnInfo(rows, 10, new Map());

    expect(col.name).toBe("");
  });

  it("handles null column_type gracefully, defaulting to VARCHAR/string", () => {
    // asString(null) → undefined, then ?? "VARCHAR" applies.
    const rows = [
      {
        column_name: "col_b",
        column_type: null,
        approx_unique: 1,
        null_percentage: 0,
      },
    ];

    const [col] = summarizeRowsToColumnInfo(rows, 10, new Map());

    expect(col.type).toBe("string");
  });
});

// ─── fetchFullTableColumnInfo ─────────────────────────────────────────────────

describe("fetchFullTableColumnInfo", () => {
  it("maps the rows returned by summarizeDataset", async () => {
    summarizeDatasetMock.mockResolvedValue([
      {
        column_name: "amount",
        column_type: "DOUBLE",
        approx_unique: 3,
        null_percentage: 0,
      },
    ]);

    const result = await fetchFullTableColumnInfo("ds_1", 10, new Map());

    expect(summarizeDatasetMock).toHaveBeenCalledWith({ datasetId: "ds_1" });
    expect(result).not.toBeNull();
    expect(result?.[0].name).toBe("amount");
    expect(result?.[0].type).toBe("number");
  });

  it("returns null when SUMMARIZE yields an empty result set", async () => {
    summarizeDatasetMock.mockResolvedValue([]);

    expect(await fetchFullTableColumnInfo("ds_1", 10, new Map())).toBeNull();
  });

  it("returns null when summarizeDataset returns a non-array", async () => {
    summarizeDatasetMock.mockResolvedValue(undefined as never);

    expect(await fetchFullTableColumnInfo("ds_1", 10, new Map())).toBeNull();
  });

  it("returns null (does not throw) when the query rejects", async () => {
    summarizeDatasetMock.mockRejectedValue(new Error("bridge unavailable"));

    expect(await fetchFullTableColumnInfo("ds_1", 10, new Map())).toBeNull();
  });
});
