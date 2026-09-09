import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fileNameFromPath,
  type ImportPipelineContext,
  importBatch,
  isSupportedImportPath,
  processFilePath,
} from "@/features/data-import/lib/import-pipeline";
import { useImportSession } from "@/features/data-import/model/import-session-store";
import type { LoadedUploadTable, LoadUploadPathOptions } from "@/platform/duckdb/upload-to-duckdb";

// ─── Boundary mocks ─────────────────────────────────────────────────────────

const loadUploadPathToDuckDB =
  vi.fn<(filePath: string, options: LoadUploadPathOptions) => Promise<LoadedUploadTable>>();

const sanitizeUploadTableName = vi.fn((name: string) =>
  name
    .replace(/\.[^.]+$/, "")
    .replace(/\W/g, "_")
    .toLowerCase(),
);

vi.mock("@/platform/duckdb/upload-to-duckdb", () => ({
  loadUploadPathToDuckDB: (filePath: string, options: LoadUploadPathOptions) =>
    loadUploadPathToDuckDB(filePath, options),
  sanitizeUploadTableName: (name: string) => sanitizeUploadTableName(name),
}));

const summarizeDataset = vi.fn<(args: { datasetId: string }) => Promise<unknown>>();

vi.mock("@/platform/electron/electron-fs", () => ({
  summarizeDataset: (args: { datasetId: string }) => summarizeDataset(args),
}));

// ─── Fixtures / builders ─────────────────────────────────────────────────────

type LoadedColumn = LoadedUploadTable["columns"][number];

function makeColumn(overrides: Partial<LoadedColumn> = {}): LoadedColumn {
  return {
    name: "col",
    type: "VARCHAR",
    nullCount: 0,
    distinctCount: 1,
    sample: ["a"],
    ...overrides,
  };
}

function makeLoaded(overrides: Partial<LoadedUploadTable> = {}): LoadedUploadTable {
  return {
    tableName: "view_sales",
    datasetId: "ds_1",
    displayName: "sales",
    format: "csv",
    rowCount: 100,
    colCount: 1,
    columns: [makeColumn()],
    previewRows: [{ col: "a" }],
    metadataSource: "preview",
    ...overrides,
  };
}

function makeContext(overrides: Partial<ImportPipelineContext> = {}): {
  ctx: ImportPipelineContext;
  spies: {
    addDataset: ReturnType<typeof vi.fn>;
    setActiveDataset: ReturnType<typeof vi.fn>;
    setAppContext: ReturnType<typeof vi.fn>;
    addActivity: ReturnType<typeof vi.fn>;
  };
} {
  const spies = {
    addDataset: vi.fn(),
    setActiveDataset: vi.fn(),
    setAppContext: vi.fn(),
    addActivity: vi.fn(),
  };
  const ctx: ImportPipelineContext = {
    isTelecomMode: false,
    canUpload: true,
    encoding: "auto",
    addDataset: spies.addDataset,
    setActiveDataset: spies.setActiveDataset,
    setAppContext: spies.setAppContext,
    addActivity: spies.addActivity,
    ...overrides,
  };
  return { ctx, spies };
}

const TELECOM_COLUMNS = [
  "ACCOUNT_ID",
  "BRAND_D",
  "TRANSACTION_ID",
  "TRANSACTION_DATE",
  "ORIGINAL_AMOUNT",
  "TRANSACTION_STATUS",
  "CHANNEL",
  "ACCOUNT_MSISDN",
];

function telecomLoaded(overrides: Partial<LoadedUploadTable> = {}): LoadedUploadTable {
  return makeLoaded({
    columns: TELECOM_COLUMNS.map((name) => makeColumn({ name })),
    colCount: TELECOM_COLUMNS.length,
    previewRows: [Object.fromEntries(TELECOM_COLUMNS.map((c) => [c, "x"]))],
    ...overrides,
  });
}

beforeEach(() => {
  useImportSession.getState().reset();
  loadUploadPathToDuckDB.mockReset();
  summarizeDataset.mockReset();
  sanitizeUploadTableName.mockClear();
  summarizeDataset.mockResolvedValue([]);
});

// ─── fileNameFromPath ─────────────────────────────────────────────────────────

describe("fileNameFromPath", () => {
  it("extracts the file name from a POSIX path", () => {
    expect(fileNameFromPath("/home/user/data/file.csv")).toBe("file.csv");
  });

  it("extracts the file name from a Windows path", () => {
    expect(fileNameFromPath("C:\\Users\\ali\\data\\report.parquet")).toBe("report.parquet");
  });

  it("handles mixed separators", () => {
    expect(fileNameFromPath("C:/Users\\ali/data\\file.tsv")).toBe("file.tsv");
  });

  it("returns the input unchanged when there is no separator", () => {
    expect(fileNameFromPath("file.csv")).toBe("file.csv");
  });

  it("preserves dots and spaces in the file name", () => {
    expect(fileNameFromPath("/tmp/My Daily Transactions.v2.csv")).toBe(
      "My Daily Transactions.v2.csv",
    );
  });

  it("returns an empty string for a trailing separator", () => {
    expect(fileNameFromPath("/a/b/")).toBe("");
  });

  it("returns the original string for an empty input", () => {
    expect(fileNameFromPath("")).toBe("");
  });
});

// ─── isSupportedImportPath ────────────────────────────────────────────────────

describe("isSupportedImportPath", () => {
  it.each([
    "/data/file.csv",
    "/data/file.tsv",
    "/data/file.txt",
    "/data/file.parquet",
    "/data/file.pq",
  ])("accepts the supported extension %s", (path) => {
    expect(isSupportedImportPath(path)).toBe(true);
  });

  it("is case-insensitive about the extension", () => {
    expect(isSupportedImportPath("/data/FILE.CSV")).toBe(true);
    expect(isSupportedImportPath("/data/Report.Parquet")).toBe(true);
  });

  it("accepts Windows paths", () => {
    expect(isSupportedImportPath("C:\\data\\file.csv")).toBe(true);
  });

  it.each([
    "/data/file.xlsx",
    "/data/file.json",
    "/data/file.pdf",
    "/data/file",
    "/data/archive.csv.gz",
  ])("rejects the unsupported path %s", (path) => {
    expect(isSupportedImportPath(path)).toBe(false);
  });

  it("rejects a path whose name merely contains a supported token without the extension", () => {
    expect(isSupportedImportPath("/data/csv-notes.md")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isSupportedImportPath("")).toBe(false);
  });
});

// ─── processFilePath: permission gate ────────────────────────────────────────

describe("processFilePath — permission gate", () => {
  it("returns null and does nothing when canUpload is false", async () => {
    const { ctx, spies } = makeContext({ canUpload: false });

    const result = await processFilePath("/data/file.csv", ctx);

    expect(result).toBeNull();
    expect(loadUploadPathToDuckDB).not.toHaveBeenCalled();
    expect(spies.addDataset).not.toHaveBeenCalled();
    expect(useImportSession.getState().order).toHaveLength(0);
  });
});

// ─── processFilePath: extension-derived format (covers || "csv" branch) ────────

describe("processFilePath — extension fallback to csv", () => {
  it("treats a path whose filename has no dot (trailing slash) as csv format", async () => {
    // A path ending in "/" produces fileName="" from fileNameFromPath.
    // "".split(".").pop() === "" which is falsy, so getExtensionFromPath falls back to "csv".
    // This exercises the `|| "csv"` branch on line 70.
    loadUploadPathToDuckDB.mockResolvedValue(makeLoaded({ format: "csv" }));
    const { ctx } = makeContext();

    // Path with trailing separator → fileName is "" → extension is "" (falsy) → "csv"
    const id = await processFilePath("/data/folder/", ctx);

    // The loader should be called with fileExtension "csv" (the fallback).
    expect(loadUploadPathToDuckDB).toHaveBeenCalledTimes(1);
    const [, options] = loadUploadPathToDuckDB.mock.calls[0];
    expect(options.fileExtension).toBe("csv");
    // Result is a valid id (import succeeded).
    expect(id).toMatch(/^file_\d+_[0-9a-f]+$/);
  });

  it("treats a path with trailing slash (empty filename) as csv format and includes encoding+storeRejects", async () => {
    // Path ending in "/" → fileNameFromPath returns "" → "".split(".").pop() = "" (falsy) → "csv"
    // This is the same path as the first test in this describe block, confirming csv fallback.
    loadUploadPathToDuckDB.mockResolvedValue(makeLoaded({ format: "csv" }));
    const { ctx } = makeContext({ encoding: "utf-8" });

    await processFilePath("/data/folder/", ctx);

    const [, options] = loadUploadPathToDuckDB.mock.calls[0];
    expect(options.fileExtension).toBe("csv");
    // csv-like → encoding and storeRejects are plumbed through
    expect(options.encoding).toBe("utf-8");
    expect(options.storeRejects).toBe(true);
  });
});

// ─── processFilePath: happy path ─────────────────────────────────────────────

describe("processFilePath — success (preview metadata)", () => {
  it("registers the dataset, wires app state, and returns the file id", async () => {
    loadUploadPathToDuckDB.mockResolvedValue(makeLoaded());
    const { ctx, spies } = makeContext();

    const id = await processFilePath("/data/sales.csv", ctx);

    expect(id).toMatch(/^file_\d+_[0-9a-f]+$/);
    expect(spies.addDataset).toHaveBeenCalledTimes(1);
    expect(spies.setActiveDataset).toHaveBeenCalledWith("ds_1");
    expect(spies.setAppContext).toHaveBeenCalledWith({
      activeDomain: "general",
      activeDatasetId: "ds_1",
      activeTableName: "view_sales",
    });
    expect(spies.addActivity).toHaveBeenCalledTimes(1);
  });

  it("drives the session row to done with 100% progress and real stats", async () => {
    loadUploadPathToDuckDB.mockResolvedValue(
      makeLoaded({ rowCount: 42, colCount: 1, previewRows: [{ col: "a" }, { col: "b" }] }),
    );
    const { ctx } = makeContext();

    const id = (await processFilePath("/data/sales.csv", ctx)) as string;

    const row = useImportSession.getState().files[id];
    expect(row.status).toBe("done");
    expect(row.progress).toBe(100);
    expect(row.rowCount).toBe(42);
    expect(row.columnCount).toBe(1);
    expect(row.dbTableName).toBe("view_sales");
    expect(row.datasetId).toBe("ds_1");
    expect(row.metadataSource).toBe("preview");
  });

  it("caps the persisted preview to 50 rows", async () => {
    const previewRows = Array.from({ length: 100 }, (_, i) => ({ col: i }));
    loadUploadPathToDuckDB.mockResolvedValue(makeLoaded({ previewRows }));
    const { ctx } = makeContext();

    const id = (await processFilePath("/data/big.csv", ctx)) as string;

    expect(useImportSession.getState().files[id].previewRows).toHaveLength(50);
  });

  it("builds the Dataset from the loader result", async () => {
    loadUploadPathToDuckDB.mockResolvedValue(
      makeLoaded({
        datasetId: "ds_99",
        displayName: "Q1 sales",
        tableName: "view_q1",
        format: "tsv",
        rowCount: 7,
        colCount: 1,
      }),
    );
    const { ctx, spies } = makeContext();

    await processFilePath("/data/q1.tsv", ctx);

    const dataset = spies.addDataset.mock.calls[0][0];
    expect(dataset).toMatchObject({
      id: "ds_99",
      name: "Q1 sales",
      tableName: "view_q1",
      viewName: "view_q1",
      sourcePath: "/data/q1.tsv",
      source: "upload",
      format: "tsv",
      rowCount: 7,
      colCount: 1,
      sizeBytes: 0,
    });
    expect(typeof dataset.qualityScore).toBe("number");
  });
});

// ─── processFilePath: full-table SUMMARIZE path ───────────────────────────────

describe("processFilePath — full-table metadata", () => {
  it("uses SUMMARIZE column info and marks metadataSource = full", async () => {
    loadUploadPathToDuckDB.mockResolvedValue(
      makeLoaded({
        rowCount: 1000,
        columns: [makeColumn({ name: "amount", type: "DOUBLE" })],
      }),
    );
    summarizeDataset.mockResolvedValue([
      {
        column_name: "amount",
        column_type: "DOUBLE",
        approx_unique: 900,
        avg: 12.5,
        min: 1,
        max: 99,
        null_percentage: 10,
      },
    ]);
    const { ctx, spies } = makeContext();

    const id = (await processFilePath("/data/sales.csv", ctx)) as string;

    expect(useImportSession.getState().files[id].metadataSource).toBe("full");
    expect(spies.addActivity.mock.calls[0][0].metadata.metadataSource).toBe("full");
  });

  it("falls back to preview metadata when SUMMARIZE throws", async () => {
    loadUploadPathToDuckDB.mockResolvedValue(makeLoaded());
    summarizeDataset.mockRejectedValue(new Error("bridge offline"));
    const { ctx } = makeContext();

    const id = (await processFilePath("/data/sales.csv", ctx)) as string;

    expect(useImportSession.getState().files[id].status).toBe("done");
    expect(useImportSession.getState().files[id].metadataSource).toBe("preview");
  });
});

// ─── processFilePath: validation issues ──────────────────────────────────────

describe("processFilePath — validation issues", () => {
  it("flags an empty file as an error-severity issue", async () => {
    loadUploadPathToDuckDB.mockResolvedValue(makeLoaded({ rowCount: 0, previewRows: [] }));
    const { ctx } = makeContext();

    const id = (await processFilePath("/data/empty.csv", ctx)) as string;

    const issues = useImportSession.getState().files[id].issues;
    expect(issues).toContainEqual({
      severity: "error",
      message: "File is empty or has no parseable data.",
    });
  });

  it("warns about columns that are >30% null in the preview sample", async () => {
    loadUploadPathToDuckDB.mockResolvedValue(
      makeLoaded({
        rowCount: 4,
        columns: [makeColumn({ name: "sparse", nullCount: 3 })],
        previewRows: [{ sparse: "a" }, { sparse: null }, { sparse: null }, { sparse: null }],
      }),
    );
    const { ctx } = makeContext();

    const id = (await processFilePath("/data/sparse.csv", ctx)) as string;

    const issues = useImportSession.getState().files[id].issues;
    const warning = issues.find((i) => i.severity === "warning");
    expect(warning?.message).toContain("1 column(s) have >30% null values in the preview sample");
    expect(warning?.column).toBe("sparse");
  });

  it("attributes the null warning to the full table when SUMMARIZE provides nullRate", async () => {
    loadUploadPathToDuckDB.mockResolvedValue(
      makeLoaded({ rowCount: 1000, columns: [makeColumn({ name: "sparse" })] }),
    );
    summarizeDataset.mockResolvedValue([
      { column_name: "sparse", column_type: "VARCHAR", null_percentage: 80, approx_unique: 5 },
    ]);
    const { ctx } = makeContext();

    const id = (await processFilePath("/data/sparse.csv", ctx)) as string;

    const warning = useImportSession
      .getState()
      .files[id].issues.find((i) => i.severity === "warning");
    expect(warning?.message).toContain("in the full table");
  });

  it("produces no null warning when every column is dense", async () => {
    loadUploadPathToDuckDB.mockResolvedValue(
      makeLoaded({
        rowCount: 10,
        columns: [makeColumn({ name: "dense", nullCount: 0 })],
        previewRows: [{ dense: "a" }],
      }),
    );
    const { ctx } = makeContext();

    const id = (await processFilePath("/data/dense.csv", ctx)) as string;

    expect(useImportSession.getState().files[id].issues).toEqual([]);
  });
});

// ─── processFilePath: reject issues ──────────────────────────────────────────

describe("processFilePath — DuckDB reject summary", () => {
  it("surfaces rejected rows as a French warning with up to three samples", async () => {
    loadUploadPathToDuckDB.mockResolvedValue(
      makeLoaded({
        rejects: {
          rejectedRowCount: 1234,
          sample: [
            { line: 5, columnName: "amount", errorType: "CAST", errorMessage: "bad number" },
            { line: 9, columnName: null, errorType: "CAST", errorMessage: null },
            { line: null, columnName: "x", errorType: null, errorMessage: null },
            { line: 12, columnName: "y", errorType: "X", errorMessage: "ignored extra" },
          ],
        },
      }),
    );
    const { ctx } = makeContext();

    const id = (await processFilePath("/data/dirty.csv", ctx)) as string;

    const issue = useImportSession.getState().files[id].issues.find((i) => i.affectedRows === 1234);
    expect(issue?.severity).toBe("warning");
    expect(issue?.message).toMatch(/1[ {2},. ]?234 ligne/);
    expect(issue?.message).toContain("Exemples :");
    expect(issue?.message).toContain("ligne 5 · amount · bad number");
    expect(issue?.message).not.toContain("ignored extra");
  });

  it("produces no detail text when the sample array is empty", async () => {
    // Empty sample array → sample.length === 0 → detail = "" → no "Exemples :" in message.
    // This exercises the `sample.length > 0 ? ... : ""` else branch (detail is "").
    loadUploadPathToDuckDB.mockResolvedValue(
      makeLoaded({
        rejects: {
          rejectedRowCount: 5,
          sample: [],
        },
      }),
    );
    const { ctx } = makeContext();

    const id = (await processFilePath("/data/dirty.csv", ctx)) as string;

    const issue = useImportSession.getState().files[id].issues.find((i) => i.affectedRows === 5);
    expect(issue?.severity).toBe("warning");
    expect(issue?.message).not.toContain("Exemples :");
    expect(issue?.message).toContain("ligne(s) ont été corrigées");
  });

  it("records the reject count on the session row for CSV imports", async () => {
    loadUploadPathToDuckDB.mockResolvedValue(
      makeLoaded({ rejects: { rejectedRowCount: 3, sample: [] } }),
    );
    const { ctx, spies } = makeContext();

    const id = (await processFilePath("/data/dirty.csv", ctx)) as string;

    expect(useImportSession.getState().files[id].rejectCount).toBe(3);
    expect(spies.addActivity.mock.calls[0][0].metadata.rejectedRows).toBe(3);
  });

  it("adds no reject issue when rejectedRowCount is zero", async () => {
    loadUploadPathToDuckDB.mockResolvedValue(
      makeLoaded({ rejects: { rejectedRowCount: 0, sample: [] } }),
    );
    const { ctx } = makeContext();

    const id = (await processFilePath("/data/clean.csv", ctx)) as string;

    expect(
      useImportSession.getState().files[id].issues.some((i) => i.affectedRows !== undefined),
    ).toBe(false);
  });

  it("adds no reject issue when rejects is undefined", async () => {
    // rejects field absent → buildRejectIssues returns []
    loadUploadPathToDuckDB.mockResolvedValue(makeLoaded({ rejects: undefined }));
    const { ctx } = makeContext();

    const id = (await processFilePath("/data/clean.csv", ctx)) as string;

    expect(
      useImportSession.getState().files[id].issues.some((i) => i.affectedRows !== undefined),
    ).toBe(false);
  });

  it("records rejectedRows as 0 in activity when rejects is absent", async () => {
    loadUploadPathToDuckDB.mockResolvedValue(makeLoaded({ rejects: undefined }));
    const { ctx, spies } = makeContext();

    await processFilePath("/data/clean.csv", ctx);

    expect(spies.addActivity.mock.calls[0][0].metadata.rejectedRows).toBe(0);
  });
});

// ─── processFilePath: CSV vs Parquet read path ───────────────────────────────

describe("processFilePath — format-specific loader options", () => {
  it("passes encoding + storeRejects for CSV-like extensions", async () => {
    loadUploadPathToDuckDB.mockResolvedValue(makeLoaded());
    const { ctx } = makeContext({ encoding: "latin-1" });

    await processFilePath("/data/sales.csv", ctx);

    const [, options] = loadUploadPathToDuckDB.mock.calls[0];
    expect(options.fileExtension).toBe("csv");
    expect(options.encoding).toBe("latin-1");
    expect(options.storeRejects).toBe(true);
    expect(options.hasHeader).toBe(true);
    expect(options.previewLimit).toBe(100);
  });

  it("maps the `auto` encoding to undefined (defers to the main process)", async () => {
    loadUploadPathToDuckDB.mockResolvedValue(makeLoaded());
    const { ctx } = makeContext({ encoding: "auto" });

    await processFilePath("/data/sales.tsv", ctx);

    const [, options] = loadUploadPathToDuckDB.mock.calls[0];
    expect(options.encoding).toBeUndefined();
    expect(options.storeRejects).toBe(true);
  });

  it("passes encoding for tsv extension (csv-like)", async () => {
    loadUploadPathToDuckDB.mockResolvedValue(makeLoaded({ format: "tsv" }));
    const { ctx } = makeContext({ encoding: "utf-8" });

    await processFilePath("/data/data.tsv", ctx);

    const [, options] = loadUploadPathToDuckDB.mock.calls[0];
    expect(options.fileExtension).toBe("tsv");
    expect(options.encoding).toBe("utf-8");
    expect(options.storeRejects).toBe(true);
  });

  it("passes encoding for txt extension (csv-like)", async () => {
    loadUploadPathToDuckDB.mockResolvedValue(makeLoaded({ format: "txt" }));
    const { ctx } = makeContext({ encoding: "utf-16" });

    await processFilePath("/data/data.txt", ctx);

    const [, options] = loadUploadPathToDuckDB.mock.calls[0];
    expect(options.fileExtension).toBe("txt");
    expect(options.encoding).toBe("utf-16");
    expect(options.storeRejects).toBe(true);
  });

  it("omits encoding + storeRejects for Parquet and leaves rejectCount undefined", async () => {
    loadUploadPathToDuckDB.mockResolvedValue(makeLoaded({ format: "parquet" }));
    const { ctx } = makeContext({ encoding: "utf-8" });

    const id = (await processFilePath("/data/sales.parquet", ctx)) as string;

    const [, options] = loadUploadPathToDuckDB.mock.calls[0];
    expect(options.fileExtension).toBe("parquet");
    expect("encoding" in options).toBe(false);
    expect("storeRejects" in options).toBe(false);
    expect(useImportSession.getState().files[id].rejectCount).toBeUndefined();
  });

  it("omits encoding + storeRejects for .pq extension", async () => {
    loadUploadPathToDuckDB.mockResolvedValue(makeLoaded({ format: "pq" }));
    const { ctx } = makeContext({ encoding: "utf-8" });

    const id = (await processFilePath("/data/sales.pq", ctx)) as string;

    const [, options] = loadUploadPathToDuckDB.mock.calls[0];
    expect(options.fileExtension).toBe("pq");
    expect("encoding" in options).toBe(false);
    expect("storeRejects" in options).toBe(false);
    expect(useImportSession.getState().files[id].rejectCount).toBeUndefined();
  });

  it("derives the upload table name from the sanitized file name plus id suffix", async () => {
    loadUploadPathToDuckDB.mockResolvedValue(makeLoaded());
    const { ctx } = makeContext();

    await processFilePath("/data/My Sales.csv", ctx);

    const [, options] = loadUploadPathToDuckDB.mock.calls[0];
    expect(sanitizeUploadTableName).toHaveBeenCalledWith("My Sales.csv");
    expect(options.tableName).toMatch(/^my_sales_[0-9a-f]{6}$/);
  });
});

// ─── processFilePath: telecom mode ───────────────────────────────────────────

describe("processFilePath — telecom mode", () => {
  it("warns when telecom mode is on but required columns are missing", async () => {
    loadUploadPathToDuckDB.mockResolvedValue(makeLoaded());
    const { ctx } = makeContext({ isTelecomMode: true });

    const id = (await processFilePath("/data/random.csv", ctx)) as string;

    const issue = useImportSession
      .getState()
      .files[id].issues.find((i) => i.message.includes("required telecom columns"));
    expect(issue?.severity).toBe("warning");
    expect(issue?.column).toBe(TELECOM_COLUMNS.join(", "));
  });

  it("sets the telecom domain and tags a compatible file", async () => {
    loadUploadPathToDuckDB.mockResolvedValue(telecomLoaded());
    const { ctx, spies } = makeContext({ isTelecomMode: true });

    await processFilePath("/data/DailyTransactions_20240115.csv", ctx);

    expect(spies.setAppContext.mock.calls[0][0].activeDomain).toBe("telecom");
    const dataset = spies.addDataset.mock.calls[0][0];
    expect(dataset.tags).toContain("telecom");
    expect(dataset.tags).toContain("daily-transactions");
    expect(dataset.description).toBe("Telecom daily transactions report");
    expect(
      useImportSession
        .getState()
        .order.map((id) => useImportSession.getState().files[id])
        .every((f) => !f.issues.some((i) => i.message.includes("required telecom columns"))),
    ).toBe(true);
  });

  it("does not add the telecom warning when telecom mode is off", async () => {
    loadUploadPathToDuckDB.mockResolvedValue(makeLoaded());
    const { ctx } = makeContext({ isTelecomMode: false });

    const id = (await processFilePath("/data/random.csv", ctx)) as string;

    expect(
      useImportSession
        .getState()
        .files[id].issues.some((i) => i.message.includes("required telecom columns")),
    ).toBe(false);
    expect(useImportSession.getState().files[id].issues).toEqual([]);
  });

  it("records telecomMode and the source path in the activity metadata", async () => {
    loadUploadPathToDuckDB.mockResolvedValue(makeLoaded());
    const { ctx, spies } = makeContext({ isTelecomMode: true });

    await processFilePath("/data/random.csv", ctx);

    expect(spies.addActivity.mock.calls[0][0].metadata).toMatchObject({
      telecomMode: true,
      sourcePath: "/data/random.csv",
      encoding: "auto",
    });
  });

  it("sets activeDomain to general when telecom mode is off", async () => {
    loadUploadPathToDuckDB.mockResolvedValue(makeLoaded());
    const { ctx, spies } = makeContext({ isTelecomMode: false });

    await processFilePath("/data/random.csv", ctx);

    expect(spies.setAppContext.mock.calls[0][0].activeDomain).toBe("general");
  });
});

// ─── processFilePath: error path ─────────────────────────────────────────────

describe("processFilePath — failure handling", () => {
  it("returns null and marks the row errored when the loader throws an Error", async () => {
    loadUploadPathToDuckDB.mockRejectedValue(new Error("COPY failed: locked"));
    const { ctx, spies } = makeContext();

    const result = await processFilePath("/data/sales.csv", ctx);

    expect(result).toBeNull();
    const row = Object.values(useImportSession.getState().files)[0];
    expect(row.status).toBe("error");
    expect(row.error).toBe("COPY failed: locked");
    expect(row.progress).toBe(0);
    expect(spies.addDataset).not.toHaveBeenCalled();
    expect(spies.setActiveDataset).not.toHaveBeenCalled();
  });

  it("stringifies a non-Error rejection into the row error", async () => {
    loadUploadPathToDuckDB.mockRejectedValue("plain string failure");
    const { ctx } = makeContext();

    await processFilePath("/data/sales.csv", ctx);

    const row = Object.values(useImportSession.getState().files)[0];
    expect(row.status).toBe("error");
    expect(row.error).toBe("plain string failure");
  });

  it("still creates a session row before the loader fails", async () => {
    loadUploadPathToDuckDB.mockRejectedValue(new Error("boom"));
    const { ctx } = makeContext();

    await processFilePath("/data/sales.csv", ctx);

    expect(useImportSession.getState().order).toHaveLength(1);
  });
});

// ─── processFilePath: session row lifecycle ───────────────────────────────────

describe("processFilePath — session row initialization", () => {
  it("seeds the row with the requested encoding and detected file type", async () => {
    loadUploadPathToDuckDB.mockResolvedValue(makeLoaded());
    const { ctx } = makeContext({ encoding: "utf-16" });

    const id = (await processFilePath("/data/report.parquet", ctx)) as string;

    const row = useImportSession.getState().files[id];
    expect(row.encoding).toBe("utf-16");
    expect(row.name).toBe("report.parquet");
    expect(row.fileType).toBe("parquet");
  });

  it("detects csv file type for .csv extension", async () => {
    loadUploadPathToDuckDB.mockResolvedValue(makeLoaded());
    const { ctx } = makeContext();

    const id = (await processFilePath("/data/data.csv", ctx)) as string;

    const row = useImportSession.getState().files[id];
    expect(row.fileType).toBe("csv");
  });

  it("detects tsv file type for .tsv extension", async () => {
    loadUploadPathToDuckDB.mockResolvedValue(makeLoaded({ format: "tsv" }));
    const { ctx } = makeContext();

    const id = (await processFilePath("/data/data.tsv", ctx)) as string;

    const row = useImportSession.getState().files[id];
    expect(row.fileType).toBe("tsv");
  });
});

// ─── importBatch ─────────────────────────────────────────────────────────────

describe("importBatch", () => {
  it("returns an empty summary for an empty path list without touching the loader", async () => {
    const { ctx } = makeContext();

    const result = await importBatch([], ctx);

    expect(result).toEqual({ doneIds: [], failed: 0 });
    expect(loadUploadPathToDuckDB).not.toHaveBeenCalled();
  });

  it("processes every path and collects the done ids", async () => {
    loadUploadPathToDuckDB.mockResolvedValue(makeLoaded());
    const { ctx } = makeContext();

    const result = await importBatch(["/data/a.csv", "/data/b.csv", "/data/c.csv"], ctx, {
      concurrency: 2,
    });

    expect(result.failed).toBe(0);
    expect(result.doneIds).toHaveLength(3);
    expect(loadUploadPathToDuckDB).toHaveBeenCalledTimes(3);
  });

  it("counts failures without aborting the rest of the batch", async () => {
    loadUploadPathToDuckDB
      .mockResolvedValueOnce(makeLoaded({ datasetId: "ds_a" }))
      .mockRejectedValueOnce(new Error("bad file"))
      .mockResolvedValueOnce(makeLoaded({ datasetId: "ds_c" }));
    const { ctx } = makeContext();

    const result = await importBatch(["/a.csv", "/b.csv", "/c.csv"], ctx, { concurrency: 1 });

    expect(result.doneIds).toHaveLength(2);
    expect(result.failed).toBe(1);
    expect(loadUploadPathToDuckDB).toHaveBeenCalledTimes(3);
  });

  it("treats a blocked import (canUpload false) as a failure for every path", async () => {
    const { ctx, spies } = makeContext({ canUpload: false });

    const result = await importBatch(["/a.csv", "/b.csv"], ctx);

    expect(result.doneIds).toEqual([]);
    expect(result.failed).toBe(2);
    expect(spies.addDataset).not.toHaveBeenCalled();
  });

  it("defaults to concurrency 2 and drains the whole queue", async () => {
    loadUploadPathToDuckDB.mockResolvedValue(makeLoaded());
    const { ctx } = makeContext();

    const result = await importBatch(["/a.csv", "/b.csv", "/c.csv", "/d.csv"], ctx);

    expect(result.doneIds).toHaveLength(4);
    expect(loadUploadPathToDuckDB).toHaveBeenCalledTimes(4);
  });

  it("clamps a concurrency of 0 up to 1 and still processes the file", async () => {
    loadUploadPathToDuckDB.mockResolvedValue(makeLoaded());
    const { ctx } = makeContext();

    const result = await importBatch(["/a.csv"], ctx, { concurrency: 0 });

    expect(result.doneIds).toHaveLength(1);
    expect(result.failed).toBe(0);
  });

  it("never invokes app navigation/callbacks more than once per file", async () => {
    loadUploadPathToDuckDB.mockResolvedValue(makeLoaded());
    const { ctx, spies } = makeContext();

    await importBatch(["/a.csv", "/b.csv"], ctx);

    expect(spies.addDataset).toHaveBeenCalledTimes(2);
    expect(spies.setActiveDataset).toHaveBeenCalledTimes(2);
  });

  it("bounds parallel in-flight work to the concurrency limit", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    loadUploadPathToDuckDB.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      await Promise.resolve();
      inFlight -= 1;
      return makeLoaded();
    });
    const { ctx } = makeContext();

    await importBatch(["/a.csv", "/b.csv", "/c.csv", "/d.csv"], ctx, { concurrency: 2 });

    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it("handles a single file with default options", async () => {
    loadUploadPathToDuckDB.mockResolvedValue(makeLoaded({ datasetId: "ds_single" }));
    const { ctx } = makeContext();

    const result = await importBatch(["/single.csv"], ctx);

    expect(result.doneIds).toHaveLength(1);
    expect(result.failed).toBe(0);
  });

  it("handles high concurrency value (more workers than files)", async () => {
    loadUploadPathToDuckDB.mockResolvedValue(makeLoaded());
    const { ctx } = makeContext();

    const result = await importBatch(["/a.csv", "/b.csv"], ctx, { concurrency: 10 });

    expect(result.doneIds).toHaveLength(2);
    expect(result.failed).toBe(0);
  });
});
