import {
  fileNameFromPath,
  isSupportedImportPath,
} from "@/features/data-import/lib/import-pipeline";

/**
 * Locks in the pure path helpers from the import pipeline. The pipeline module
 * imports DuckDB/Electron boundaries at the top level, so those are mocked to
 * inert stubs — the helpers under test touch none of them.
 */

vi.mock("@/platform/duckdb/upload-to-duckdb", () => ({
  loadUploadPathToDuckDB: vi.fn(),
  sanitizeUploadTableName: vi.fn((name: string) => name),
}));

vi.mock("@/platform/electron/electron-fs", () => ({
  summarizeDataset: vi.fn(),
}));

describe("fileNameFromPath", () => {
  it("extracts the file name from a POSIX path", () => {
    expect(fileNameFromPath("/home/user/data/file.csv")).toBe("file.csv");
  });

  it("extracts the file name from a Windows path", () => {
    expect(fileNameFromPath("C:\\Users\\ali\\data\\report.parquet")).toBe(
      "report.parquet",
    );
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
    // "/a/b/" -> parts end in "" -> last element is "".
    expect(fileNameFromPath("/a/b/")).toBe("");
  });

  it("returns the original string for an empty input", () => {
    expect(fileNameFromPath("")).toBe("");
  });
});

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
