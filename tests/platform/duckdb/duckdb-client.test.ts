import { beforeEach, describe, expect, it, vi } from "vitest";

const bridgeMocks = vi.hoisted(() => ({
  init: vi.fn(),
  registerCSVPathDataset: vi.fn(),
  registerParquetPathDataset: vi.fn(),
  listDatasets: vi.fn(),
  previewDataset: vi.fn(),
  summarizeDataset: vi.fn(),
  exportDataset: vi.fn(),
  deleteDataset: vi.fn(),
  getStatus: vi.fn(),
  getQueryMetrics: vi.fn(),
  clearQueryMetrics: vi.fn(),
  runReadOnlyQuery: vi.fn(),
  runReadOnlyQueryArrow: vi.fn(),
  profileDataset: vi.fn(),
  profileColumnDetail: vi.fn(),
  countRows: vi.fn(),
  fetchKeysetPage: vi.fn(),
  cancelQueries: vi.fn(),
  resetCancelToken: vi.fn(),
}));

import { duckdbBridge, duckdbClient, hasElectronDuckDB } from "@/platform/duckdb/duckdb-client";

type CSVInput = Parameters<typeof duckdbClient.registerCSVPathDataset>[0];
type ParquetInput = Parameters<typeof duckdbClient.registerParquetPathDataset>[0];

const csvInput = { path: "/data/a.csv" } as unknown as CSVInput;
const parquetInput = { path: "/data/a.parquet" } as unknown as ParquetInput;
const refInput = { datasetId: "ds1" } as unknown as Parameters<
  typeof duckdbClient.summarizeDataset
>[0];

function installBridge() {
  (window as unknown as Record<string, unknown>).electronDuckDB = bridgeMocks;
  for (const fn of Object.values(bridgeMocks)) fn.mockReset();
  bridgeMocks.init.mockResolvedValue({ success: true });
  duckdbClient.reset();
}

beforeEach(() => {
  installBridge();
});

describe("duckdbClient availability", () => {
  it("reports unavailable without the preload bridge", () => {
    delete (window as unknown as Record<string, unknown>).electronDuckDB;
    expect(duckdbClient.available).toBe(false);
    expect(duckdbClient.ready).toBe(false);
    expect(duckdbClient.failed).toBe(false);
  });

  it("reports available once the bridge exists", () => {
    expect(duckdbClient.available).toBe(true);
  });

  it("rejects operations when the bridge is missing", async () => {
    delete (window as unknown as Record<string, unknown>).electronDuckDB;
    await expect(duckdbClient.listDatasets()).rejects.toThrow(/unavailable/i);
  });
});

describe("duckdbClient init", () => {
  it("initializes once and caches the in-flight promise", async () => {
    const p1 = duckdbClient.init();
    const p2 = duckdbClient.init();
    await expect(p1).resolves.toBeUndefined();
    await expect(p2).resolves.toBeUndefined();
    expect(bridgeMocks.init).toHaveBeenCalledOnce();
    expect(duckdbClient.ready).toBe(true);
  });

  it("marks the client failed when init rejects", async () => {
    bridgeMocks.init.mockRejectedValueOnce(new Error("nope"));
    await expect(duckdbClient.init()).rejects.toThrow("nope");
    expect(duckdbClient.failed).toBe(true);
    await expect(duckdbClient.listDatasets()).rejects.toThrow(/unavailable/i);
  });

  it("reset() clears ready and failed flags", async () => {
    bridgeMocks.init.mockRejectedValueOnce(new Error("nope"));
    await expect(duckdbClient.init()).rejects.toThrow();
    duckdbClient.reset();
    expect(duckdbClient.failed).toBe(false);
    expect(duckdbClient.ready).toBe(false);
  });
});

describe("duckdbClient dataset operations", () => {
  it("delegates registration, listing, preview, and removal", async () => {
    bridgeMocks.registerCSVPathDataset.mockResolvedValue({ id: "a" });
    bridgeMocks.registerParquetPathDataset.mockResolvedValue({ id: "b" });
    bridgeMocks.listDatasets.mockResolvedValue([{ id: "a" }]);
    bridgeMocks.previewDataset.mockResolvedValue([{ x: 1 }]);
    bridgeMocks.summarizeDataset.mockResolvedValue([{ n: 2 }]);
    bridgeMocks.exportDataset.mockResolvedValue(undefined);
    bridgeMocks.deleteDataset.mockResolvedValue(undefined);

    await expect(duckdbClient.registerCSVPathDataset(csvInput)).resolves.toEqual({ id: "a" });
    await expect(duckdbClient.registerParquetPathDataset(parquetInput)).resolves.toEqual({
      id: "b",
    });
    await expect(duckdbClient.listDatasets()).resolves.toEqual([{ id: "a" }]);
    await expect(duckdbClient.previewDataset(refInput)).resolves.toEqual([{ x: 1 }]);
    await expect(duckdbClient.summarizeDataset(refInput)).resolves.toEqual([{ n: 2 }]);
    await expect(duckdbClient.exportDataset(refInput)).resolves.toBeUndefined();
    await expect(duckdbClient.deleteDataset(refInput)).resolves.toBeUndefined();
    expect(bridgeMocks.registerCSVPathDataset).toHaveBeenCalledWith(csvInput);
  });

  it("delegates queries, profiling, counts, pages, and cancellation", async () => {
    bridgeMocks.runReadOnlyQuery.mockResolvedValue([{ n: 1 }]);
    bridgeMocks.runReadOnlyQueryArrow.mockResolvedValue(new Uint8Array([1, 2]));
    bridgeMocks.profileDataset.mockResolvedValue([{ column_name: "a" }]);
    bridgeMocks.profileColumnDetail.mockResolvedValue({ column: "a" });
    bridgeMocks.countRows.mockResolvedValue(42);
    bridgeMocks.fetchKeysetPage.mockResolvedValue({ rows: [] });
    bridgeMocks.cancelQueries.mockResolvedValue(undefined);
    bridgeMocks.resetCancelToken.mockResolvedValue(undefined);
    bridgeMocks.getStatus.mockResolvedValue({ ok: true });
    bridgeMocks.getQueryMetrics.mockResolvedValue([{ q: 1 }]);
    bridgeMocks.clearQueryMetrics.mockResolvedValue(undefined);

    await expect(duckdbClient.runReadOnlyQuery("SELECT 1")).resolves.toEqual([{ n: 1 }]);
    await expect(duckdbClient.runReadOnlyQueryArrow("SELECT 1", "t")).resolves.toEqual(
      new Uint8Array([1, 2]),
    );
    await expect(duckdbClient.profileDataset(refInput)).resolves.toEqual([{ column_name: "a" }]);
    await expect(duckdbClient.profileColumnDetail(refInput)).resolves.toEqual({ column: "a" });
    await expect(duckdbClient.countRows(refInput)).resolves.toBe(42);
    await expect(duckdbClient.fetchKeysetPage(refInput)).resolves.toEqual({ rows: [] });
    await expect(duckdbClient.cancelQueries("t")).resolves.toBeUndefined();
    await expect(duckdbClient.resetCancelToken("t")).resolves.toBeUndefined();
    await expect(duckdbClient.getStatus()).resolves.toEqual({ ok: true });
    await expect(duckdbClient.getQueryMetrics()).resolves.toEqual([{ q: 1 }]);
    await expect(duckdbClient.clearQueryMetrics()).resolves.toBeUndefined();
  });

  it("times out a hung bridge call", async () => {
    vi.useFakeTimers();
    try {
      bridgeMocks.listDatasets.mockReturnValue(new Promise(() => {}));
      const pending = duckdbClient.listDatasets();
      const assertion = expect(pending).rejects.toThrow(/timed out/i);
      await vi.advanceTimersByTimeAsync(30_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("hasElectronDuckDB()", () => {
  it("returns false when electronDuckDB is absent", () => {
    delete (window as unknown as Record<string, unknown>).electronDuckDB;
    expect(hasElectronDuckDB()).toBe(false);
  });

  it("returns true when electronDuckDB is present", () => {
    (window as unknown as Record<string, unknown>).electronDuckDB = bridgeMocks;
    expect(hasElectronDuckDB()).toBe(true);
  });
});

describe("duckdbBridge() exported accessor", () => {
  it("throws when electronDuckDB is absent", () => {
    delete (window as unknown as Record<string, unknown>).electronDuckDB;
    expect(() => duckdbBridge()).toThrow(
      "electronDuckDB not available — ensure the app is running inside Electron.",
    );
  });

  it("returns the bridge when electronDuckDB is present", () => {
    (window as unknown as Record<string, unknown>).electronDuckDB = bridgeMocks;
    expect(duckdbBridge()).toBe(bridgeMocks);
  });
});
