import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RegisteredDatasetWithPreview } from "@/platform/duckdb/duckdb";

// ── Mock the duckdb module so no real DuckDB connection is needed ──────────────
vi.mock("@/platform/duckdb/duckdb", () => ({
  registerCSVPathDataset: vi.fn(),
  registerParquetPathDataset: vi.fn(),
}));

import {
  sanitizeUploadTableName,
  loadUploadPathToDuckDB,
  loadUploadFileToDuckDB,
  type LoadUploadPathOptions,
} from "@/platform/duckdb/upload-to-duckdb";

import {
  registerCSVPathDataset,
  registerParquetPathDataset,
} from "@/platform/duckdb/duckdb";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal RegisteredDatasetWithPreview for test scenarios. */
function makeDataset(
  overrides: Partial<RegisteredDatasetWithPreview> = {},
): RegisteredDatasetWithPreview {
  return {
    id: "ds-001",
    displayName: "My Dataset",
    viewName: "ds_001",
    sourcePath: "/data/file.csv",
    cachePath: "/cache/ds-001.parquet",
    sourceFormat: "csv",
    rowCount: 3,
    columns: [
      { name: "col_a", type: "VARCHAR", nullable: true },
      { name: "col_b", type: "BIGINT", nullable: false },
    ],
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    previewRows: [
      { col_a: "foo", col_b: 1 },
      { col_a: "bar", col_b: 2 },
      { col_a: null, col_b: 3 },
    ],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// sanitizeUploadTableName
// ─────────────────────────────────────────────────────────────────────────────

describe("sanitizeUploadTableName", () => {
  it("strips the file extension from a simple filename", () => {
    // Arrange / Act
    const result = sanitizeUploadTableName("report.csv");
    // Assert
    expect(result).toBe("report");
  });

  it("lowercases the resulting name", () => {
    expect(sanitizeUploadTableName("MyFile.CSV")).toBe("myfile");
  });

  it("replaces non-word characters with underscores", () => {
    expect(sanitizeUploadTableName("sales data 2024.csv")).toBe("sales_data_2024");
  });

  it("collapses consecutive underscores into a single one", () => {
    expect(sanitizeUploadTableName("a--b__c.csv")).toBe("a_b_c");
  });

  it("strips leading and trailing underscores", () => {
    expect(sanitizeUploadTableName("_foo_.csv")).toBe("foo");
  });

  it("truncates to at most 60 characters", () => {
    // 65 'a' characters
    const long = "a".repeat(65) + ".csv";
    const result = sanitizeUploadTableName(long);
    expect(result.length).toBe(60);
  });

  it("returns 'dataset' as fallback when result would be empty", () => {
    // Only non-word characters; extension removed leaves nothing
    expect(sanitizeUploadTableName("---.csv")).toBe("dataset");
  });

  it("handles a name with no extension gracefully", () => {
    expect(sanitizeUploadTableName("nodot")).toBe("nodot");
  });

  it("strips only the last extension when multiple dots are present", () => {
    expect(sanitizeUploadTableName("archive.tar.gz")).toBe("archive_tar");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// loadUploadPathToDuckDB – CSV / TSV / TXT (csv-like) paths
// ─────────────────────────────────────────────────────────────────────────────

describe("loadUploadPathToDuckDB – CSV path", () => {
  beforeEach(() => {
    vi.mocked(registerCSVPathDataset).mockResolvedValue(makeDataset());
  });

  it("calls registerCSVPathDataset for a .csv file and returns a LoadedUploadTable", async () => {
    // Arrange
    const filePath = "/data/sales.csv";
    const options: LoadUploadPathOptions = { fileExtension: "csv" };

    // Act
    const result = await loadUploadPathToDuckDB(filePath, options);

    // Assert – registerCSV was called (not registerParquet)
    expect(registerCSVPathDataset).toHaveBeenCalledOnce();
    expect(registerParquetPathDataset).not.toHaveBeenCalled();

    // Assert – shape of the returned table
    expect(result.tableName).toBe("ds_001");
    expect(result.datasetId).toBe("ds-001");
    expect(result.format).toBe("csv");
    expect(result.metadataSource).toBe("preview");
  });

  it("passes hasHeader: true by default when not supplied", async () => {
    await loadUploadPathToDuckDB("/data/x.csv", { fileExtension: "csv" });
    expect(vi.mocked(registerCSVPathDataset).mock.calls[0][0]).toMatchObject({ hasHeader: true });
  });

  it("passes caller-supplied hasHeader: false through", async () => {
    await loadUploadPathToDuckDB("/data/x.csv", { fileExtension: "csv", hasHeader: false });
    expect(vi.mocked(registerCSVPathDataset).mock.calls[0][0]).toMatchObject({ hasHeader: false });
  });

  it("uses displayName option over tableName when both are given", async () => {
    await loadUploadPathToDuckDB("/data/x.csv", {
      fileExtension: "csv",
      displayName: "My Display",
      tableName: "my_table",
    });
    expect(vi.mocked(registerCSVPathDataset).mock.calls[0][0]).toMatchObject({
      displayName: "My Display",
    });
  });

  it("falls back to tableName when displayName is not given", async () => {
    await loadUploadPathToDuckDB("/data/x.csv", {
      fileExtension: "csv",
      tableName: "fallback_name",
    });
    expect(vi.mocked(registerCSVPathDataset).mock.calls[0][0]).toMatchObject({
      displayName: "fallback_name",
    });
  });

  it("derives displayName from the file path when neither option is supplied", async () => {
    await loadUploadPathToDuckDB("/data/transactions.csv", { fileExtension: "csv" });
    expect(vi.mocked(registerCSVPathDataset).mock.calls[0][0]).toMatchObject({
      displayName: "transactions",
    });
  });

  it("uses the default preview limit of 100 when previewLimit is omitted", async () => {
    await loadUploadPathToDuckDB("/data/x.csv", { fileExtension: "csv" });
    expect(vi.mocked(registerCSVPathDataset).mock.calls[0][0]).toMatchObject({ previewLimit: 100 });
  });

  it("passes a caller-supplied previewLimit through", async () => {
    await loadUploadPathToDuckDB("/data/x.csv", { fileExtension: "csv", previewLimit: 50 });
    expect(vi.mocked(registerCSVPathDataset).mock.calls[0][0]).toMatchObject({ previewLimit: 50 });
  });

  it("injects tab delimiter automatically for TSV files", async () => {
    await loadUploadPathToDuckDB("/data/data.tsv", { fileExtension: "tsv" });
    expect(vi.mocked(registerCSVPathDataset).mock.calls[0][0]).toMatchObject({ delimiter: "\t" });
  });

  it("passes an explicit delimiter through unchanged (overrides TSV default)", async () => {
    await loadUploadPathToDuckDB("/data/data.tsv", {
      fileExtension: "tsv",
      delimiter: "|",
    });
    expect(vi.mocked(registerCSVPathDataset).mock.calls[0][0]).toMatchObject({ delimiter: "|" });
  });

  it("accepts .txt as a csv-like format", async () => {
    const result = await loadUploadPathToDuckDB("/data/data.txt", { fileExtension: "txt" });
    expect(result.format).toBe("txt");
    expect(registerCSVPathDataset).toHaveBeenCalled();
  });

  it("passes the encoding option through to registerCSVPathDataset", async () => {
    await loadUploadPathToDuckDB("/data/x.csv", {
      fileExtension: "csv",
      encoding: "latin-1",
    });
    expect(vi.mocked(registerCSVPathDataset).mock.calls[0][0]).toMatchObject({
      encoding: "latin-1",
    });
  });

  it("passes storeRejects: true through to registerCSVPathDataset", async () => {
    await loadUploadPathToDuckDB("/data/x.csv", {
      fileExtension: "csv",
      storeRejects: true,
    });
    expect(vi.mocked(registerCSVPathDataset).mock.calls[0][0]).toMatchObject({
      storeRejects: true,
    });
  });

  it("includes rejects in the result when the dataset has them", async () => {
    // Arrange
    const rejects = { rejectedRowCount: 2, sample: [] };
    vi.mocked(registerCSVPathDataset).mockResolvedValueOnce(makeDataset({ rejects }));

    // Act
    const result = await loadUploadPathToDuckDB("/data/x.csv", { fileExtension: "csv" });

    // Assert
    expect(result.rejects).toEqual(rejects);
  });

  it("omits the rejects field when the dataset has no rejects", async () => {
    const result = await loadUploadPathToDuckDB("/data/x.csv", { fileExtension: "csv" });
    expect(result.rejects).toBeUndefined();
  });

  it("limits previewRows to the previewLimit", async () => {
    // Dataset returns 3 rows; previewLimit=2 should cap the result
    const result = await loadUploadPathToDuckDB("/data/x.csv", {
      fileExtension: "csv",
      previewLimit: 2,
    });
    expect(result.previewRows).toHaveLength(2);
  });

  it("propagates rowCount and colCount from the dataset", async () => {
    const result = await loadUploadPathToDuckDB("/data/x.csv", { fileExtension: "csv" });
    expect(result.rowCount).toBe(3);
    expect(result.colCount).toBe(2);
  });

  it("propagates displayName from the dataset", async () => {
    const result = await loadUploadPathToDuckDB("/data/x.csv", { fileExtension: "csv" });
    expect(result.displayName).toBe("My Dataset");
  });

  it("surfaces a rejection from registerCSVPathDataset as a thrown error", async () => {
    vi.mocked(registerCSVPathDataset).mockRejectedValueOnce(new Error("DuckDB error"));
    await expect(
      loadUploadPathToDuckDB("/data/x.csv", { fileExtension: "csv" }),
    ).rejects.toThrow("DuckDB error");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// loadUploadPathToDuckDB – Parquet paths
// ─────────────────────────────────────────────────────────────────────────────

describe("loadUploadPathToDuckDB – Parquet path", () => {
  beforeEach(() => {
    vi.mocked(registerParquetPathDataset).mockResolvedValue(makeDataset({ format: "parquet" } as never));
  });

  it("calls registerParquetPathDataset for a .parquet file", async () => {
    const result = await loadUploadPathToDuckDB("/data/snapshot.parquet", {
      fileExtension: "parquet",
    });
    expect(registerParquetPathDataset).toHaveBeenCalledOnce();
    expect(registerCSVPathDataset).not.toHaveBeenCalled();
    expect(result.format).toBe("parquet");
  });

  it("accepts the .pq alias for parquet", async () => {
    const result = await loadUploadPathToDuckDB("/data/snapshot.pq", {
      fileExtension: "pq",
    });
    expect(result.format).toBe("pq");
    expect(registerParquetPathDataset).toHaveBeenCalled();
  });

  it("passes displayName derived from the path when no option is given", async () => {
    await loadUploadPathToDuckDB("/data/monthly_report.parquet", { fileExtension: "parquet" });
    expect(vi.mocked(registerParquetPathDataset).mock.calls[0][0]).toMatchObject({
      displayName: "monthly_report",
    });
  });

  it("passes caller-supplied displayName to registerParquetPathDataset", async () => {
    await loadUploadPathToDuckDB("/data/x.parquet", {
      fileExtension: "parquet",
      displayName: "Q3 Report",
    });
    expect(vi.mocked(registerParquetPathDataset).mock.calls[0][0]).toMatchObject({
      displayName: "Q3 Report",
    });
  });

  it("passes previewLimit to registerParquetPathDataset", async () => {
    await loadUploadPathToDuckDB("/data/x.parquet", {
      fileExtension: "parquet",
      previewLimit: 25,
    });
    expect(vi.mocked(registerParquetPathDataset).mock.calls[0][0]).toMatchObject({
      previewLimit: 25,
    });
  });

  it("surfaces a rejection from registerParquetPathDataset", async () => {
    vi.mocked(registerParquetPathDataset).mockRejectedValueOnce(new Error("parquet fail"));
    await expect(
      loadUploadPathToDuckDB("/data/x.parquet", { fileExtension: "parquet" }),
    ).rejects.toThrow("parquet fail");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// loadUploadPathToDuckDB – extension normalisation and error paths
// ─────────────────────────────────────────────────────────────────────────────

describe("loadUploadPathToDuckDB – extension normalisation", () => {
  beforeEach(() => {
    vi.mocked(registerCSVPathDataset).mockResolvedValue(makeDataset());
    vi.mocked(registerParquetPathDataset).mockResolvedValue(makeDataset());
  });

  it("prefers the explicit fileExtension over the extension in the path", async () => {
    // Path says .txt but caller forces csv
    await loadUploadPathToDuckDB("/data/data.txt", { fileExtension: "csv" });
    expect(registerCSVPathDataset).toHaveBeenCalled();
  });

  it("infers format from the file path extension when given a generic SupportedExtensions value", async () => {
    // SupportedExtensions includes 'csv'; passing csv as fileExtension is valid
    const result = await loadUploadPathToDuckDB("/data/x.csv", { fileExtension: "csv" });
    expect(result.format).toBe("csv");
  });

  it("throws for an unsupported extension and does not call any DuckDB function", async () => {
    await expect(
      loadUploadPathToDuckDB("/data/x.xlsx", { fileExtension: "xlsx" as never }),
    ).rejects.toThrow(/Unsupported dataset file type/);
    expect(registerCSVPathDataset).not.toHaveBeenCalled();
    expect(registerParquetPathDataset).not.toHaveBeenCalled();
  });

  it("throws a descriptive message listing all supported types", async () => {
    await expect(
      loadUploadPathToDuckDB("/data/x.json", { fileExtension: "json" as never }),
    ).rejects.toThrow(/csv.*tsv.*txt.*parquet.*pq/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// loadUploadFileToDuckDB – always throws (intentionally disabled)
// ─────────────────────────────────────────────────────────────────────────────

describe("loadUploadFileToDuckDB", () => {
  it("always throws an error explaining that file-based upload is disabled", async () => {
    const file = new File(["a,b\n1,2"], "test.csv", { type: "text/csv" });
    await expect(
      loadUploadFileToDuckDB(file, { fileExtension: "csv" }),
    ).rejects.toThrow(/File-based upload.*disabled/i);
  });

  it("includes the file extension in the error message", async () => {
    const file = new File([], "data.parquet");
    await expect(
      loadUploadFileToDuckDB(file, { fileExtension: "parquet" }),
    ).rejects.toThrow(/\.parquet/);
  });

  it("includes guidance to use openLocalFileDialog in the error", async () => {
    const file = new File([], "x.csv");
    await expect(
      loadUploadFileToDuckDB(file, { fileExtension: "csv" }),
    ).rejects.toThrow(/openLocalFileDialog/);
  });

  it("includes guidance to use loadUploadPathToDuckDB in the error", async () => {
    const file = new File([], "x.csv");
    await expect(
      loadUploadFileToDuckDB(file, { fileExtension: "csv" }),
    ).rejects.toThrow(/loadUploadPathToDuckDB/);
  });

  it("throws even if the file name is empty (falls back to 'dataset')", async () => {
    // File with no name — browser File API may return empty string
    const file = { name: "", size: 0 } as File;
    await expect(
      loadUploadFileToDuckDB(file, { fileExtension: "csv" }),
    ).rejects.toThrow();
  });

  it("throws for a parquet file too (not just csv)", async () => {
    const file = new File([], "snap.parquet");
    await expect(
      loadUploadFileToDuckDB(file, { fileExtension: "parquet" }),
    ).rejects.toThrow(/disabled/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildPreviewColumnMetadata – tested indirectly through loadUploadPathToDuckDB
// ─────────────────────────────────────────────────────────────────────────────

describe("column metadata derivation", () => {
  beforeEach(() => {
    vi.mocked(registerCSVPathDataset).mockResolvedValue(makeDataset());
  });

  it("includes one metadata entry per column in the dataset", async () => {
    const result = await loadUploadPathToDuckDB("/data/x.csv", { fileExtension: "csv" });
    expect(result.columns).toHaveLength(2);
  });

  it("reports the column name from the dataset columns list", async () => {
    const result = await loadUploadPathToDuckDB("/data/x.csv", { fileExtension: "csv" });
    expect(result.columns[0].name).toBe("col_a");
    expect(result.columns[1].name).toBe("col_b");
  });

  it("uses the DuckDB column type when available", async () => {
    const result = await loadUploadPathToDuckDB("/data/x.csv", { fileExtension: "csv" });
    expect(result.columns[0].type).toBe("VARCHAR");
    expect(result.columns[1].type).toBe("BIGINT");
  });

  it("counts nulls in previewRows for a column", async () => {
    // col_a has one null row out of 3
    const result = await loadUploadPathToDuckDB("/data/x.csv", { fileExtension: "csv" });
    expect(result.columns[0].nullCount).toBe(1);
  });

  it("counts distinct non-null values in previewRows for a column", async () => {
    // col_a: "foo" and "bar" → 2 distinct
    const result = await loadUploadPathToDuckDB("/data/x.csv", { fileExtension: "csv" });
    expect(result.columns[0].distinctCount).toBe(2);
  });

  it("provides up to 5 non-null sample values per column", async () => {
    const result = await loadUploadPathToDuckDB("/data/x.csv", { fileExtension: "csv" });
    // col_a has 2 non-null values
    expect(result.columns[0].sample).toEqual(["foo", "bar"]);
  });

  it("infers min, max, mean for a numeric column", async () => {
    // col_b values: 1, 2, 3 → all numbers
    const result = await loadUploadPathToDuckDB("/data/x.csv", { fileExtension: "csv" });
    expect(result.columns[1].min).toBe(1);
    expect(result.columns[1].max).toBe(3);
    expect(result.columns[1].mean).toBeCloseTo(2, 5);
  });

  it("omits min, max, mean for a non-numeric column", async () => {
    const result = await loadUploadPathToDuckDB("/data/x.csv", { fileExtension: "csv" });
    expect(result.columns[0].min).toBeUndefined();
    expect(result.columns[0].max).toBeUndefined();
    expect(result.columns[0].mean).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getExtension – exercised via loadUploadPathToDuckDB without explicit fileExtension
// ─────────────────────────────────────────────────────────────────────────────

describe("getExtension (via normalizeExtension fallback path)", () => {
  beforeEach(() => {
    vi.mocked(registerCSVPathDataset).mockResolvedValue(makeDataset());
    vi.mocked(registerParquetPathDataset).mockResolvedValue(makeDataset());
  });

  it("derives format from the file path extension when no explicit fileExtension is given", async () => {
    // Pass undefined as fileExtension (cast to satisfy TS) so getExtension(filePath) is called
    const result = await loadUploadPathToDuckDB("/data/sales.csv", {
      fileExtension: undefined as never,
    });
    expect(result.format).toBe("csv");
    expect(registerCSVPathDataset).toHaveBeenCalled();
  });

  it("strips query-string fragments from the path before extracting the extension", async () => {
    // Path with ?query — getExtension must clean it before pop()
    const result = await loadUploadPathToDuckDB("/data/sales.csv?v=1", {
      fileExtension: undefined as never,
    });
    expect(result.format).toBe("csv");
  });

  it("strips hash fragments from the path before extracting the extension", async () => {
    // Path with #hash — getExtension must clean it before pop()
    const result = await loadUploadPathToDuckDB("/data/report.parquet#section", {
      fileExtension: undefined as never,
    });
    expect(result.format).toBe("parquet");
    expect(registerParquetPathDataset).toHaveBeenCalled();
  });

  it("throws an Unsupported error when the path has no recognised extension and no explicit type", async () => {
    // No dot in the filename; getExtension returns the whole path segment (truthy)
    // normalizeExtension then throws "Unsupported dataset file type"
    await expect(
      loadUploadPathToDuckDB("/data/nodotfile", { fileExtension: undefined as never }),
    ).rejects.toThrow(/Unsupported dataset file type/i);
  });

  it("returns 'unknown' in the error message when file path is completely empty string", async () => {
    // Empty string: "".split(".") → [""], pop → "" (falsy) → getExtension returns ""
    // normalizeExtension: String("" || "") → "" → ext || "unknown" in the error
    await expect(
      loadUploadPathToDuckDB("", { fileExtension: undefined as never }),
    ).rejects.toThrow(/unknown/i);
  });

  it("falls back to 'dataset' display name when the path starts with a dot (no real basename stem)", async () => {
    // ".csv" → basename returns ".csv" → stripExtension removes ".csv" → "" → defaultDisplayName returns "dataset"
    const result = await loadUploadPathToDuckDB(".csv", { fileExtension: undefined as never });
    expect(vi.mocked(registerCSVPathDataset).mock.calls[0][0]).toMatchObject({
      displayName: "dataset",
    });
    expect(result.format).toBe("csv");
  });

  it("falls back to 'dataset' display name when the path is only a separator (basename returns empty)", async () => {
    // "/" → basename: "/".split(/[\\/]/) → ["",""] → pop() → "" (falsy) → returns "dataset"
    // Use explicit fileExtension so normalizeExtension doesn't throw
    const result = await loadUploadPathToDuckDB("/", { fileExtension: "csv" });
    expect(vi.mocked(registerCSVPathDataset).mock.calls[0][0]).toMatchObject({
      displayName: "dataset",
    });
    expect(result.format).toBe("csv");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// inferPreviewType – tested indirectly through column metadata
// ─────────────────────────────────────────────────────────────────────────────

describe("preview type inference (via column metadata)", () => {
  async function inferType(values: unknown[]): Promise<string> {
    const dataset = makeDataset({
      columns: [{ name: "v", type: "", nullable: true }],
      previewRows: values.map((val) => ({ v: val })),
    });
    vi.mocked(registerCSVPathDataset).mockResolvedValueOnce(dataset);
    const result = await loadUploadPathToDuckDB("/x.csv", { fileExtension: "csv" });
    return result.columns[0].type;
  }

  it("returns 'string' when all values are null/empty", async () => {
    expect(await inferType([null, undefined, ""])).toBe("string");
  });

  it("returns 'number' when >80 % of non-null values are numeric", async () => {
    // 5 of 6 non-null = 83.3 % > 0.8 threshold
    expect(await inferType([1, 2, 3, 4, 5, "hello"])).toBe("number");
  });

  it("returns 'boolean' when >80 % of non-null values are true/false", async () => {
    expect(await inferType(["true", "false", "true", "true", "true"])).toBe("boolean");
  });

  it("returns 'string' when date-like values are at or below the 80 % threshold", async () => {
    // 3 of 4 = 75 % — not strictly > 0.8
    expect(await inferType(["2024-01-01", "2024-02-15", "2024-03-20", "not-a-date"])).toBe(
      "string",
    );
  });

  it("returns 'date' when >80 % of non-null values match YYYY-MM-DD prefix", async () => {
    // 5 of 6 = 83.3 % > 0.8 threshold
    expect(
      await inferType(["2024-01-01", "2024-02-15", "2024-03-20", "2024-04-10", "2024-05-01", "x"]),
    ).toBe("date");
  });

  it("returns 'string' for a mix that crosses no 80 % threshold", async () => {
    expect(await inferType(["hello", 42, "world", true])).toBe("string");
  });

  it("uses the DuckDB column type instead of inferred type when column.type is non-empty", async () => {
    // The makeDataset default has type: "VARCHAR" which is non-empty;
    // inferPreviewType is only used as fallback when type is falsy.
    const dataset = makeDataset({
      columns: [{ name: "v", type: "DOUBLE", nullable: true }],
      previewRows: [{ v: "hello" }], // would infer "string" but DuckDB says DOUBLE
    });
    vi.mocked(registerCSVPathDataset).mockResolvedValueOnce(dataset);
    const result = await loadUploadPathToDuckDB("/x.csv", { fileExtension: "csv" });
    expect(result.columns[0].type).toBe("DOUBLE");
  });
});
