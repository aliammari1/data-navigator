/**
 * Unit tests for src/platform/electron/electron-fs.ts
 *
 * The module is a thin IPC bridge – it reads/writes window.electronFS and
 * window.electronDuckDB. We stub those globals and exercise every exported
 * function and branch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type {
  ElectronFSBridge,
  ElectronDuckDBBridge,
  RegisteredDataset,
  RegisteredDatasetWithPreview,
  DuckDBStatus,
  QueryMetric,
} from "@/platform/electron/electron-fs";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFsBridge(overrides: Partial<ElectronFSBridge> = {}): ElectronFSBridge {
  return {
    getDataDir: vi.fn().mockResolvedValue("/data"),
    readFile: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
    writeFile: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue(true),
    listFiles: vi.fn().mockResolvedValue(["a.csv", "b.csv"]),
    listFilesRecursive: vi.fn().mockResolvedValue(["sub/a.csv"]),
    fileExists: vi.fn().mockResolvedValue(true),
    openDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ["/some/file.csv"] }),
    saveDialog: vi.fn().mockResolvedValue({ canceled: false, filePath: "/out/file.csv" }),
    getPathForFile: vi.fn().mockReturnValue("/resolved/file.csv"),
    ...overrides,
  };
}

const mockDataset: RegisteredDataset = {
  id: "ds-1",
  displayName: "Test Dataset",
  viewName: "test_ds",
  sourcePath: "/data/test.csv",
  cachePath: "/cache/test.parquet",
  sourceFormat: "csv",
  rowCount: 100,
  columns: [{ name: "col1", type: "VARCHAR", nullable: false }],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const mockDatasetWithPreview: RegisteredDatasetWithPreview = {
  ...mockDataset,
  previewRows: [{ col1: "value1" }],
};

function makeDuckDBBridge(overrides: Partial<ElectronDuckDBBridge> = {}): ElectronDuckDBBridge {
  return {
    init: vi.fn().mockResolvedValue({ success: true }),
    registerCSVPathDataset: vi.fn().mockResolvedValue(mockDatasetWithPreview),
    registerParquetPathDataset: vi.fn().mockResolvedValue(mockDatasetWithPreview),
    listDatasets: vi.fn().mockResolvedValue([mockDataset]),
    previewDataset: vi.fn().mockResolvedValue([{ col1: "v" }]),
    summarizeDataset: vi.fn().mockResolvedValue([{ stat: "count", value: 100 }]),
    exportDataset: vi.fn().mockResolvedValue(undefined),
    deleteDataset: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockResolvedValue({
      active: true,
      dbPath: "/db/main.duckdb",
      datasetsDir: "/data",
      readConnections: 2,
      pendingReads: 0,
      pendingWrites: 0,
    } satisfies DuckDBStatus),
    getQueryMetrics: vi.fn().mockResolvedValue([
      { sql: "SELECT 1", durationMs: 5, timestamp: 1000, rowCount: 1 } satisfies QueryMetric,
    ]),
    clearQueryMetrics: vi.fn().mockResolvedValue(undefined),
    runReadOnlyQuery: vi.fn().mockResolvedValue([{ result: 1 }]),
    ...overrides,
  };
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  // Start each test with no electron bridges attached
  vi.stubGlobal("window", {
    electronFS: undefined,
    electronDuckDB: undefined,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Runtime Detection ────────────────────────────────────────────────────────

describe("isElectron()", () => {
  it("returns false when no bridges are present", async () => {
    const { isElectron } = await import("@/platform/electron/electron-fs");
    expect(isElectron()).toBe(false);
  });

  it("returns false when only electronFS is present", async () => {
    vi.stubGlobal("window", { electronFS: makeFsBridge(), electronDuckDB: undefined });
    const { isElectron } = await import("@/platform/electron/electron-fs");
    expect(isElectron()).toBe(false);
  });

  it("returns false when only electronDuckDB is present", async () => {
    vi.stubGlobal("window", { electronFS: undefined, electronDuckDB: makeDuckDBBridge() });
    const { isElectron } = await import("@/platform/electron/electron-fs");
    expect(isElectron()).toBe(false);
  });

  it("returns true when both electronFS and electronDuckDB are present", async () => {
    vi.stubGlobal("window", {
      electronFS: makeFsBridge(),
      electronDuckDB: makeDuckDBBridge(),
    });
    const { isElectron } = await import("@/platform/electron/electron-fs");
    expect(isElectron()).toBe(true);
  });
});

describe("hasElectronFS()", () => {
  it("returns false when electronFS is absent", async () => {
    const { hasElectronFS } = await import("@/platform/electron/electron-fs");
    expect(hasElectronFS()).toBe(false);
  });

  it("returns true when electronFS is present", async () => {
    vi.stubGlobal("window", { electronFS: makeFsBridge() });
    const { hasElectronFS } = await import("@/platform/electron/electron-fs");
    expect(hasElectronFS()).toBe(true);
  });
});

describe("hasElectronDuckDB()", () => {
  it("returns false when electronDuckDB is absent", async () => {
    const { hasElectronDuckDB } = await import("@/platform/electron/electron-fs");
    expect(hasElectronDuckDB()).toBe(false);
  });

  it("returns true when electronDuckDB is present", async () => {
    vi.stubGlobal("window", { electronDuckDB: makeDuckDBBridge() });
    const { hasElectronDuckDB } = await import("@/platform/electron/electron-fs");
    expect(hasElectronDuckDB()).toBe(true);
  });
});

// ─── Internal Bridge Accessor error paths ────────────────────────────────────

describe("duckdbBridge() exported accessor", () => {
  it("throws when electronDuckDB is absent", async () => {
    const { duckdbBridge } = await import("@/platform/electron/electron-fs");
    expect(() => duckdbBridge()).toThrow(
      "electronDuckDB not available — ensure the app is running inside Electron.",
    );
  });

  it("returns the bridge when electronDuckDB is present", async () => {
    const db = makeDuckDBBridge();
    vi.stubGlobal("window", { electronDuckDB: db });
    const { duckdbBridge } = await import("@/platform/electron/electron-fs");
    expect(duckdbBridge()).toBe(db);
  });
});

// ─── Filesystem API ───────────────────────────────────────────────────────────

describe("Filesystem API — happy paths", () => {
  it("getDataDir() delegates to fsBridge().getDataDir()", async () => {
    const fs = makeFsBridge();
    vi.stubGlobal("window", { electronFS: fs });
    const { getDataDir } = await import("@/platform/electron/electron-fs");
    await expect(getDataDir()).resolves.toBe("/data");
    expect(fs.getDataDir).toHaveBeenCalledTimes(1);
  });

  it("readLocalFile() delegates to fsBridge().readFile()", async () => {
    const fs = makeFsBridge();
    vi.stubGlobal("window", { electronFS: fs });
    const { readLocalFile } = await import("@/platform/electron/electron-fs");
    const buf = await readLocalFile("/tmp/test.csv");
    expect(buf).toBeInstanceOf(ArrayBuffer);
    expect(fs.readFile).toHaveBeenCalledWith("/tmp/test.csv");
  });

  it("writeLocalFile() delegates to fsBridge().writeFile()", async () => {
    const fs = makeFsBridge();
    vi.stubGlobal("window", { electronFS: fs });
    const { writeLocalFile } = await import("@/platform/electron/electron-fs");
    const buf = new ArrayBuffer(4);
    await writeLocalFile("/tmp/out.csv", buf);
    expect(fs.writeFile).toHaveBeenCalledWith("/tmp/out.csv", buf);
  });

  it("deleteLocalFile() delegates to fsBridge().deleteFile() and returns boolean", async () => {
    const fs = makeFsBridge();
    vi.stubGlobal("window", { electronFS: fs });
    const { deleteLocalFile } = await import("@/platform/electron/electron-fs");
    await expect(deleteLocalFile("/tmp/del.csv")).resolves.toBe(true);
    expect(fs.deleteFile).toHaveBeenCalledWith("/tmp/del.csv");
  });

  it("listLocalFiles() delegates to fsBridge().listFiles()", async () => {
    const fs = makeFsBridge();
    vi.stubGlobal("window", { electronFS: fs });
    const { listLocalFiles } = await import("@/platform/electron/electron-fs");
    await expect(listLocalFiles()).resolves.toEqual(["a.csv", "b.csv"]);
    expect(fs.listFiles).toHaveBeenCalledWith(undefined);
  });

  it("listLocalFiles() passes dir argument when provided", async () => {
    const fs = makeFsBridge();
    vi.stubGlobal("window", { electronFS: fs });
    const { listLocalFiles } = await import("@/platform/electron/electron-fs");
    await listLocalFiles("/some/dir");
    expect(fs.listFiles).toHaveBeenCalledWith("/some/dir");
  });

  it("listLocalFilesRecursive() delegates to fsBridge().listFilesRecursive()", async () => {
    const fs = makeFsBridge();
    vi.stubGlobal("window", { electronFS: fs });
    const { listLocalFilesRecursive } = await import("@/platform/electron/electron-fs");
    await expect(listLocalFilesRecursive("/root")).resolves.toEqual(["sub/a.csv"]);
    expect(fs.listFilesRecursive).toHaveBeenCalledWith("/root");
  });

  it("localFileExists() delegates to fsBridge().fileExists()", async () => {
    const fs = makeFsBridge();
    vi.stubGlobal("window", { electronFS: fs });
    const { localFileExists } = await import("@/platform/electron/electron-fs");
    await expect(localFileExists("/tmp/check.csv")).resolves.toBe(true);
    expect(fs.fileExists).toHaveBeenCalledWith("/tmp/check.csv");
  });
});

describe("Filesystem API — error paths (missing bridge)", () => {
  it("getDataDir() throws when electronFS is absent", async () => {
    const { getDataDir } = await import("@/platform/electron/electron-fs");
    expect(() => getDataDir()).toThrow(
      "electronFS not available — ensure the app is running inside Electron.",
    );
  });

  it("readLocalFile() throws when electronFS is absent", async () => {
    const { readLocalFile } = await import("@/platform/electron/electron-fs");
    expect(() => readLocalFile("/x")).toThrow("electronFS not available");
  });

  it("writeLocalFile() throws when electronFS is absent", async () => {
    const { writeLocalFile } = await import("@/platform/electron/electron-fs");
    expect(() => writeLocalFile("/x", new ArrayBuffer(0))).toThrow("electronFS not available");
  });

  it("deleteLocalFile() throws when electronFS is absent", async () => {
    const { deleteLocalFile } = await import("@/platform/electron/electron-fs");
    expect(() => deleteLocalFile("/x")).toThrow("electronFS not available");
  });
});

// ─── openFileDialog ───────────────────────────────────────────────────────────

describe("openFileDialog()", () => {
  it("returns filePaths array when dialog is not canceled", async () => {
    const fs = makeFsBridge({
      openDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ["/a.csv", "/b.csv"] }),
    });
    vi.stubGlobal("window", { electronFS: fs });
    const { openFileDialog } = await import("@/platform/electron/electron-fs");
    const result = await openFileDialog({ title: "Open" });
    expect(result).toEqual(["/a.csv", "/b.csv"]);
  });

  it("returns empty array when dialog is canceled", async () => {
    const fs = makeFsBridge({
      openDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
    });
    vi.stubGlobal("window", { electronFS: fs });
    const { openFileDialog } = await import("@/platform/electron/electron-fs");
    const result = await openFileDialog({ title: "Open" });
    expect(result).toEqual([]);
  });

  it("passes options through to the bridge", async () => {
    const fs = makeFsBridge();
    vi.stubGlobal("window", { electronFS: fs });
    const { openFileDialog } = await import("@/platform/electron/electron-fs");
    const options = {
      title: "Select CSV",
      filters: [{ name: "CSV", extensions: ["csv"] }],
      properties: ["openFile" as const, "multiSelections" as const],
    };
    await openFileDialog(options);
    expect(fs.openDialog).toHaveBeenCalledWith(options);
  });
});

// ─── saveFileDialog ───────────────────────────────────────────────────────────

describe("saveFileDialog()", () => {
  it("returns filePath when dialog is not canceled and filePath is present", async () => {
    const fs = makeFsBridge({
      saveDialog: vi
        .fn()
        .mockResolvedValue({ canceled: false, filePath: "/out/export.csv" }),
    });
    vi.stubGlobal("window", { electronFS: fs });
    const { saveFileDialog } = await import("@/platform/electron/electron-fs");
    await expect(saveFileDialog({ title: "Save" })).resolves.toBe("/out/export.csv");
  });

  it("returns null when dialog is canceled", async () => {
    const fs = makeFsBridge({
      saveDialog: vi.fn().mockResolvedValue({ canceled: true, filePath: undefined }),
    });
    vi.stubGlobal("window", { electronFS: fs });
    const { saveFileDialog } = await import("@/platform/electron/electron-fs");
    await expect(saveFileDialog({ title: "Save" })).resolves.toBeNull();
  });

  it("returns null when filePath is missing even if not canceled", async () => {
    // Edge case: canceled=false but no filePath provided
    const fs = makeFsBridge({
      saveDialog: vi.fn().mockResolvedValue({ canceled: false, filePath: undefined }),
    });
    vi.stubGlobal("window", { electronFS: fs });
    const { saveFileDialog } = await import("@/platform/electron/electron-fs");
    await expect(saveFileDialog({})).resolves.toBeNull();
  });

  it("passes options (defaultPath, filters) through to the bridge", async () => {
    const fs = makeFsBridge();
    vi.stubGlobal("window", { electronFS: fs });
    const { saveFileDialog } = await import("@/platform/electron/electron-fs");
    const options = {
      title: "Export",
      defaultPath: "/home/user/export.csv",
      filters: [{ name: "CSV files", extensions: ["csv"] }],
    };
    await saveFileDialog(options);
    expect(fs.saveDialog).toHaveBeenCalledWith(options);
  });
});

// ─── localDataPath ────────────────────────────────────────────────────────────

describe("localDataPath()", () => {
  it("concatenates the data directory and the filename with a slash", async () => {
    const fs = makeFsBridge({ getDataDir: vi.fn().mockResolvedValue("/app/data") });
    vi.stubGlobal("window", { electronFS: fs });
    const { localDataPath } = await import("@/platform/electron/electron-fs");
    await expect(localDataPath("settings.json")).resolves.toBe("/app/data/settings.json");
  });

  it("works with nested filenames containing slashes", async () => {
    const fs = makeFsBridge({ getDataDir: vi.fn().mockResolvedValue("/base") });
    vi.stubGlobal("window", { electronFS: fs });
    const { localDataPath } = await import("@/platform/electron/electron-fs");
    await expect(localDataPath("sub/file.db")).resolves.toBe("/base/sub/file.db");
  });
});

// ─── getDroppedFilePaths ──────────────────────────────────────────────────────

describe("getDroppedFilePaths()", () => {
  it("returns empty array when electronFS is absent (web context)", async () => {
    // window has no electronFS
    const { getDroppedFilePaths } = await import("@/platform/electron/electron-fs");
    const result = getDroppedFilePaths([new File([""], "test.csv")]);
    expect(result).toEqual([]);
  });

  it("resolves file paths via bridge.getPathForFile when present", async () => {
    const fs = makeFsBridge({
      getPathForFile: vi.fn().mockReturnValue("/disk/dropped.csv"),
    });
    vi.stubGlobal("window", { electronFS: fs });
    const { getDroppedFilePaths } = await import("@/platform/electron/electron-fs");
    const file = new File(["data"], "dropped.csv");
    const result = getDroppedFilePaths([file]);
    expect(result).toEqual(["/disk/dropped.csv"]);
    expect(fs.getPathForFile).toHaveBeenCalledWith(file);
  });

  it("skips files that throw during getPathForFile", async () => {
    const fs = makeFsBridge({
      getPathForFile: vi
        .fn()
        .mockImplementationOnce(() => {
          throw new Error("cannot resolve");
        })
        .mockReturnValueOnce("/disk/good.csv"),
    });
    vi.stubGlobal("window", { electronFS: fs });
    const { getDroppedFilePaths } = await import("@/platform/electron/electron-fs");
    const bad = new File([""], "bad.csv");
    const good = new File(["data"], "good.csv");
    const result = getDroppedFilePaths([bad, good]);
    expect(result).toEqual(["/disk/good.csv"]);
  });

  it("skips files that resolve to a falsy path", async () => {
    const fs = makeFsBridge({
      getPathForFile: vi.fn().mockReturnValue(""),
    });
    vi.stubGlobal("window", { electronFS: fs });
    const { getDroppedFilePaths } = await import("@/platform/electron/electron-fs");
    const result = getDroppedFilePaths([new File([""], "empty-path.csv")]);
    expect(result).toEqual([]);
  });

  it("returns all resolved paths when multiple valid files are dropped", async () => {
    const fs = makeFsBridge({
      getPathForFile: vi
        .fn()
        .mockReturnValueOnce("/path/a.csv")
        .mockReturnValueOnce("/path/b.parquet"),
    });
    vi.stubGlobal("window", { electronFS: fs });
    const { getDroppedFilePaths } = await import("@/platform/electron/electron-fs");
    const files = [new File([""], "a.csv"), new File([""], "b.parquet")];
    const result = getDroppedFilePaths(files);
    expect(result).toEqual(["/path/a.csv", "/path/b.parquet"]);
  });

  it("returns empty array for empty file list", async () => {
    const fs = makeFsBridge();
    vi.stubGlobal("window", { electronFS: fs });
    const { getDroppedFilePaths } = await import("@/platform/electron/electron-fs");
    expect(getDroppedFilePaths([])).toEqual([]);
  });
});

// ─── DuckDB Dataset API ───────────────────────────────────────────────────────

describe("DuckDB Dataset API — happy paths", () => {
  it("initDuckDB() calls bridge.init() and resolves", async () => {
    const db = makeDuckDBBridge();
    vi.stubGlobal("window", { electronDuckDB: db });
    const { initDuckDB } = await import("@/platform/electron/electron-fs");
    await expect(initDuckDB()).resolves.toBeUndefined();
    expect(db.init).toHaveBeenCalledTimes(1);
  });

  it("registerCSVPathDataset() delegates to bridge with all input fields", async () => {
    const db = makeDuckDBBridge();
    vi.stubGlobal("window", { electronDuckDB: db });
    const { registerCSVPathDataset } = await import("@/platform/electron/electron-fs");
    const input = {
      filePath: "/data/file.csv",
      displayName: "My CSV",
      hasHeader: true,
      delimiter: ",",
      sampleSize: 1000,
      previewLimit: 20,
    };
    const result = await registerCSVPathDataset(input);
    expect(result).toEqual(mockDatasetWithPreview);
    expect(db.registerCSVPathDataset).toHaveBeenCalledWith(input);
  });

  it("registerParquetPathDataset() delegates to bridge with input fields", async () => {
    const db = makeDuckDBBridge();
    vi.stubGlobal("window", { electronDuckDB: db });
    const { registerParquetPathDataset } = await import("@/platform/electron/electron-fs");
    const input = { filePath: "/data/file.parquet", displayName: "Parquet DS", previewLimit: 10 };
    const result = await registerParquetPathDataset(input);
    expect(result).toEqual(mockDatasetWithPreview);
    expect(db.registerParquetPathDataset).toHaveBeenCalledWith(input);
  });

  it("listDatasets() returns array of datasets from bridge", async () => {
    const db = makeDuckDBBridge();
    vi.stubGlobal("window", { electronDuckDB: db });
    const { listDatasets } = await import("@/platform/electron/electron-fs");
    await expect(listDatasets()).resolves.toEqual([mockDataset]);
    expect(db.listDatasets).toHaveBeenCalledTimes(1);
  });

  it("previewDataset() delegates with datasetId, limit and offset", async () => {
    const db = makeDuckDBBridge();
    vi.stubGlobal("window", { electronDuckDB: db });
    const { previewDataset } = await import("@/platform/electron/electron-fs");
    const input = { datasetId: "ds-1", limit: 50, offset: 10 };
    const result = await previewDataset(input);
    expect(result).toEqual([{ col1: "v" }]);
    expect(db.previewDataset).toHaveBeenCalledWith(input);
  });

  it("summarizeDataset() delegates with datasetId", async () => {
    const db = makeDuckDBBridge();
    vi.stubGlobal("window", { electronDuckDB: db });
    const { summarizeDataset } = await import("@/platform/electron/electron-fs");
    const result = await summarizeDataset({ datasetId: "ds-1" });
    expect(result).toEqual([{ stat: "count", value: 100 }]);
    expect(db.summarizeDataset).toHaveBeenCalledWith({ datasetId: "ds-1" });
  });

  it("exportDataset() delegates with datasetId and targetPath", async () => {
    const db = makeDuckDBBridge();
    vi.stubGlobal("window", { electronDuckDB: db });
    const { exportDataset } = await import("@/platform/electron/electron-fs");
    await expect(
      exportDataset({ datasetId: "ds-1", targetPath: "/out/export.parquet" }),
    ).resolves.toBeUndefined();
    expect(db.exportDataset).toHaveBeenCalledWith({
      datasetId: "ds-1",
      targetPath: "/out/export.parquet",
    });
  });

  it("deleteDataset() delegates with datasetId", async () => {
    const db = makeDuckDBBridge();
    vi.stubGlobal("window", { electronDuckDB: db });
    const { deleteDataset } = await import("@/platform/electron/electron-fs");
    await expect(deleteDataset({ datasetId: "ds-1" })).resolves.toBeUndefined();
    expect(db.deleteDataset).toHaveBeenCalledWith({ datasetId: "ds-1" });
  });

  it("getDuckDBStatus() returns the bridge status object", async () => {
    const db = makeDuckDBBridge();
    vi.stubGlobal("window", { electronDuckDB: db });
    const { getDuckDBStatus } = await import("@/platform/electron/electron-fs");
    const status = await getDuckDBStatus();
    expect(status.active).toBe(true);
    expect(status.dbPath).toBe("/db/main.duckdb");
    expect(status.readConnections).toBe(2);
  });

  it("getDuckDBQueryMetrics() returns query metrics array", async () => {
    const db = makeDuckDBBridge();
    vi.stubGlobal("window", { electronDuckDB: db });
    const { getDuckDBQueryMetrics } = await import("@/platform/electron/electron-fs");
    const metrics = await getDuckDBQueryMetrics();
    expect(metrics).toHaveLength(1);
    expect(metrics[0].sql).toBe("SELECT 1");
    expect(metrics[0].durationMs).toBe(5);
  });

  it("clearDuckDBQueryMetrics() delegates to bridge.clearQueryMetrics()", async () => {
    const db = makeDuckDBBridge();
    vi.stubGlobal("window", { electronDuckDB: db });
    const { clearDuckDBQueryMetrics } = await import("@/platform/electron/electron-fs");
    await expect(clearDuckDBQueryMetrics()).resolves.toBeUndefined();
    expect(db.clearQueryMetrics).toHaveBeenCalledTimes(1);
  });
});

describe("DuckDB Dataset API — error paths (missing bridge)", () => {
  it("initDuckDB() rejects when electronDuckDB is absent", async () => {
    const { initDuckDB } = await import("@/platform/electron/electron-fs");
    await expect(initDuckDB()).rejects.toThrow("electronDuckDB not available");
  });

  it("listDatasets() throws when electronDuckDB is absent", async () => {
    const { listDatasets } = await import("@/platform/electron/electron-fs");
    expect(() => listDatasets()).toThrow("electronDuckDB not available");
  });

  it("getDuckDBStatus() throws when electronDuckDB is absent", async () => {
    const { getDuckDBStatus } = await import("@/platform/electron/electron-fs");
    expect(() => getDuckDBStatus()).toThrow("electronDuckDB not available");
  });

  it("getDuckDBQueryMetrics() throws when electronDuckDB is absent", async () => {
    const { getDuckDBQueryMetrics } = await import("@/platform/electron/electron-fs");
    expect(() => getDuckDBQueryMetrics()).toThrow("electronDuckDB not available");
  });
});

// ─── window === undefined branches ───────────────────────────────────────────
// Cover the typeof window === "undefined" early-exit paths inside fsBridge()
// and duckdbBridge(). We delete the global so the guard fires.

describe("fsBridge() — window undefined branch", () => {
  it("throws 'window is not available' when window is undefined (via getDataDir)", async () => {
    vi.stubGlobal("window", undefined);
    const { getDataDir } = await import("@/platform/electron/electron-fs");
    expect(() => getDataDir()).toThrow("window is not available.");
  });
});

describe("duckdbBridge() — window undefined branch", () => {
  it("throws 'window is not available' when window is undefined", async () => {
    vi.stubGlobal("window", undefined);
    const { duckdbBridge } = await import("@/platform/electron/electron-fs");
    expect(() => duckdbBridge()).toThrow("window is not available.");
  });
});
