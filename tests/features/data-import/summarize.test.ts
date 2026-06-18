import { summarizeDataset } from "@/platform/electron/electron-fs";
import {
  fetchFullTableColumnInfo,
  mapDuckTypeToColumnInfoType,
  summarizeRowsToColumnInfo,
} from "@/features/data-import/model/summarize";

/**
 * Locks in the shared DuckDB-type mapper and the SUMMARIZE-row -> ColumnInfo
 * shaping. The DuckDB/Electron boundary (`summarizeDataset`) is mocked; no real
 * query runs.
 */

vi.mock("@/platform/electron/electron-fs", () => ({
  summarizeDataset: vi.fn(),
}));

const summarizeDatasetMock = vi.mocked(summarizeDataset);

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
  ])("maps %s to number", (duckType) => {
    expect(mapDuckTypeToColumnInfoType(duckType)).toBe("number");
  });

  it.each(["DATE", "TIMESTAMP", "TIMESTAMP WITH TIME ZONE", "TIME"])(
    "maps %s to date",
    (duckType) => {
      expect(mapDuckTypeToColumnInfoType(duckType)).toBe("date");
    },
  );

  it.each(["BOOLEAN", "BOOL"])("maps %s to boolean", (duckType) => {
    expect(mapDuckTypeToColumnInfoType(duckType)).toBe("boolean");
  });

  it("honours the 'mixed' sentinel from the preview path", () => {
    expect(mapDuckTypeToColumnInfoType("mixed")).toBe("mixed");
  });

  it("is case-insensitive", () => {
    expect(mapDuckTypeToColumnInfoType("integer")).toBe("number");
    expect(mapDuckTypeToColumnInfoType("Date")).toBe("date");
  });

  it("falls back to string for VARCHAR and unknown types", () => {
    expect(mapDuckTypeToColumnInfoType("VARCHAR")).toBe("string");
    expect(mapDuckTypeToColumnInfoType("BLOB")).toBe("string");
    expect(mapDuckTypeToColumnInfoType("JSON")).toBe("string");
  });

  it("classifies a numeric-keyword substring before the string fallback", () => {
    // "bigint" contains "int"; ensures substring matching wins.
    expect(mapDuckTypeToColumnInfoType("UBIGINT")).toBe("number");
  });
});

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
    // nullCount = round(0.1 * 1000)
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
    const rows = [
      { column_name: "region", column_type: "VARCHAR", approx_unique: 3 },
    ];
    const samples = new Map<string, unknown[]>([["region", ["N", "S", "E"]]]);

    const [col] = summarizeRowsToColumnInfo(rows, 10, samples);

    expect(col.sampleValues).toEqual(["N", "S", "E"]);
  });

  it("defaults sample values to an empty array when none are provided", () => {
    const rows = [
      { column_name: "x", column_type: "INTEGER", approx_unique: 1 },
    ];

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
});

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
    // Defensive: the Electron bridge may be absent and return undefined.
    summarizeDatasetMock.mockResolvedValue(undefined as never);

    expect(await fetchFullTableColumnInfo("ds_1", 10, new Map())).toBeNull();
  });

  it("returns null (does not throw) when the query rejects", async () => {
    summarizeDatasetMock.mockRejectedValue(new Error("bridge unavailable"));

    expect(await fetchFullTableColumnInfo("ds_1", 10, new Map())).toBeNull();
  });
});
