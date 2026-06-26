/**
 * Tests for useDatasetCatalog hook.
 *
 * Strategy:
 * - Mock @/platform/duckdb/duckdb so no real DuckDB is touched.
 * - Mock @/core/stores/data-store to control Zustand state per test.
 * - Keep the real useDatasetCatalog logic so coverage counts.
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RegisteredDataset } from "@/platform/duckdb/duckdb";

// ─── Mock listRegisteredDatasets ──────────────────────────────────────────────

const mockListRegisteredDatasets = vi.fn();

vi.mock("@/platform/duckdb/duckdb", () => ({
  listRegisteredDatasets: (...args: unknown[]) => mockListRegisteredDatasets(...args),
}));

// ─── Mock data store ──────────────────────────────────────────────────────────

const mockSetActiveDataset = vi.fn();
const mockReplaceDatasetsFromCatalog = vi.fn();
let mockActiveDatasetId: string | null = null;

vi.mock("@/core/stores/data-store", () => ({
  useDataStore: vi.fn(() => ({
    activeDatasetId: mockActiveDatasetId,
    setActiveDataset: mockSetActiveDataset,
    replaceDatasetsFromCatalog: mockReplaceDatasetsFromCatalog,
  })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { useDatasetCatalog } from "@/features/parsed-data/hooks/useDatasetCatalog";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDataset(over: Partial<RegisteredDataset> = {}): RegisteredDataset {
  return {
    id: "ds-1",
    displayName: "Test Dataset",
    viewName: "test_view",
    sourcePath: "/tmp/test.csv",
    cachePath: "/tmp/test.parquet",
    sourceFormat: "csv",
    rowCount: 100,
    columns: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    ...over,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockActiveDatasetId = null;
});

describe("useDatasetCatalog – initial state", () => {
  it("starts with loading false, empty catalog, null error, null activeDataset", () => {
    // Arrange – listRegisteredDatasets never resolves during this sync check
    mockListRegisteredDatasets.mockReturnValue(new Promise(() => {}));

    // Act
    const { result } = renderHook(() => useDatasetCatalog(0));

    // Assert – synchronous initial state (before the async resolves)
    // loading starts false before the effect fires
    expect(result.current.catalog).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.activeDataset).toBeNull();
    expect(result.current.activeDatasetId).toBeNull();
    expect(typeof result.current.setActiveDataset).toBe("function");
  });
});

describe("useDatasetCatalog – happy path", () => {
  it("loads catalog and mirrors datasets into store", async () => {
    // Arrange
    const ds1 = makeDataset({ id: "ds-1" });
    const ds2 = makeDataset({ id: "ds-2", displayName: "Second" });
    mockListRegisteredDatasets.mockResolvedValue([ds1, ds2]);

    // Act
    const { result } = renderHook(() => useDatasetCatalog(0));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert
    expect(result.current.catalog).toEqual([ds1, ds2]);
    expect(result.current.error).toBeNull();
    expect(mockReplaceDatasetsFromCatalog).toHaveBeenCalledOnce();
    expect(mockReplaceDatasetsFromCatalog).toHaveBeenCalledWith([ds1, ds2]);
  });

  it("auto-selects the first dataset when activeDatasetId is null and catalog is non-empty", async () => {
    // Arrange – no active dataset yet
    mockActiveDatasetId = null;
    const ds1 = makeDataset({ id: "ds-first" });
    mockListRegisteredDatasets.mockResolvedValue([ds1]);

    // Act
    const { result } = renderHook(() => useDatasetCatalog(0));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert – auto-select fired
    expect(mockSetActiveDataset).toHaveBeenCalledOnce();
    expect(mockSetActiveDataset).toHaveBeenCalledWith("ds-first");
  });

  it("does NOT auto-select when activeDatasetId is already set", async () => {
    // Arrange – an existing active dataset
    mockActiveDatasetId = "already-active";
    const ds1 = makeDataset({ id: "ds-1" });
    mockListRegisteredDatasets.mockResolvedValue([ds1]);

    // Act
    const { result } = renderHook(() => useDatasetCatalog(0));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert – auto-select should NOT fire
    expect(mockSetActiveDataset).not.toHaveBeenCalled();
  });

  it("does NOT auto-select when catalog is empty", async () => {
    // Arrange – empty result from IPC
    mockActiveDatasetId = null;
    mockListRegisteredDatasets.mockResolvedValue([]);

    // Act
    const { result } = renderHook(() => useDatasetCatalog(0));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert
    expect(mockSetActiveDataset).not.toHaveBeenCalled();
    expect(result.current.catalog).toEqual([]);
  });
});

describe("useDatasetCatalog – loading state", () => {
  it("transitions loading true → false after the async resolves", async () => {
    // Arrange – hang the promise so we can observe loading=true
    let resolve!: (value: RegisteredDataset[]) => void;
    const pending = new Promise<RegisteredDataset[]>((res) => {
      resolve = res;
    });
    mockListRegisteredDatasets.mockReturnValue(pending);

    // Act
    const { result } = renderHook(() => useDatasetCatalog(0));

    // Wait until loading becomes true (effect fires)
    await waitFor(() => expect(result.current.loading).toBe(true));

    // Resolve
    await act(async () => {
      resolve([]);
    });

    // Assert
    expect(result.current.loading).toBe(false);
  });
});

describe("useDatasetCatalog – error handling", () => {
  it("captures Error instance message in error state", async () => {
    // Arrange
    mockListRegisteredDatasets.mockRejectedValue(new Error("IPC failure"));

    // Act
    const { result } = renderHook(() => useDatasetCatalog(0));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert – branch: caught instanceof Error → caught.message
    expect(result.current.error).toBe("IPC failure");
    expect(result.current.catalog).toEqual([]);
  });

  it("converts non-Error thrown values to string in error state", async () => {
    // Arrange – throw a raw string (not an Error instance)
    mockListRegisteredDatasets.mockRejectedValue("something went wrong");

    // Act
    const { result } = renderHook(() => useDatasetCatalog(0));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert – branch: !(caught instanceof Error) → String(caught)
    expect(result.current.error).toBe("something went wrong");
  });

  it("converts thrown number to string in error state", async () => {
    // Arrange
    mockListRegisteredDatasets.mockRejectedValue(42);

    // Act
    const { result } = renderHook(() => useDatasetCatalog(0));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert
    expect(result.current.error).toBe("42");
  });

  it("clears previous error on a successful re-fetch", async () => {
    // Arrange – first call fails, second succeeds
    const ds1 = makeDataset({ id: "ds-1" });
    mockListRegisteredDatasets
      .mockRejectedValueOnce(new Error("First failure"))
      .mockResolvedValueOnce([ds1]);

    const { result, rerender } = renderHook(({ key }: { key: number }) => useDatasetCatalog(key), {
      initialProps: { key: 0 },
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("First failure");

    // Act – bump refreshKey to trigger re-fetch
    rerender({ key: 1 });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert – error was cleared
    expect(result.current.error).toBeNull();
    expect(result.current.catalog).toEqual([ds1]);
  });
});

describe("useDatasetCatalog – activeDataset derivation", () => {
  it("returns the matching catalog entry when activeDatasetId is found", async () => {
    // Arrange
    mockActiveDatasetId = "ds-2";
    const ds1 = makeDataset({ id: "ds-1" });
    const ds2 = makeDataset({ id: "ds-2", displayName: "Active One" });
    mockListRegisteredDatasets.mockResolvedValue([ds1, ds2]);

    // Act
    const { result } = renderHook(() => useDatasetCatalog(0));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert – found by id
    expect(result.current.activeDataset).toEqual(ds2);
  });

  it("falls back to catalog[0] when activeDatasetId does not match any catalog entry", async () => {
    // Arrange – activeDatasetId points to a dataset not in catalog
    mockActiveDatasetId = "non-existent";
    const ds1 = makeDataset({ id: "ds-1", displayName: "Fallback" });
    mockListRegisteredDatasets.mockResolvedValue([ds1]);

    // Act
    const { result } = renderHook(() => useDatasetCatalog(0));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert – falls back to catalog[0]
    expect(result.current.activeDataset).toEqual(ds1);
  });

  it("returns null when catalog is empty (no match, no fallback)", async () => {
    // Arrange
    mockActiveDatasetId = null;
    mockListRegisteredDatasets.mockResolvedValue([]);

    // Act
    const { result } = renderHook(() => useDatasetCatalog(0));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert
    expect(result.current.activeDataset).toBeNull();
  });
});

describe("useDatasetCatalog – refreshKey", () => {
  it("re-fetches the catalog when refreshKey changes", async () => {
    // Arrange
    const ds1 = makeDataset({ id: "ds-1" });
    const ds2 = makeDataset({ id: "ds-2", displayName: "Updated" });
    mockListRegisteredDatasets
      .mockResolvedValueOnce([ds1])
      .mockResolvedValueOnce([ds2]);

    const { result, rerender } = renderHook(({ key }: { key: number }) => useDatasetCatalog(key), {
      initialProps: { key: 0 },
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.catalog).toEqual([ds1]);

    // Act – bump refreshKey
    rerender({ key: 1 });

    await waitFor(() => expect(result.current.catalog).toEqual([ds2]));

    // Assert
    expect(mockListRegisteredDatasets).toHaveBeenCalledTimes(2);
  });

  it("re-fetches when both refreshKey and activeDatasetId change", async () => {
    // Arrange
    const ds1 = makeDataset({ id: "ds-1" });
    mockListRegisteredDatasets.mockResolvedValue([ds1]);

    const { result, rerender } = renderHook(({ key }: { key: number }) => useDatasetCatalog(key), {
      initialProps: { key: 0 },
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Act – simulate active dataset changing externally (causes refreshCatalog dep change)
    mockActiveDatasetId = "ds-1";
    rerender({ key: 1 });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert – fetched at least twice
    expect(mockListRegisteredDatasets.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe("useDatasetCatalog – return shape", () => {
  it("returns setActiveDataset from the data store", async () => {
    // Arrange
    mockListRegisteredDatasets.mockResolvedValue([]);

    // Act
    const { result } = renderHook(() => useDatasetCatalog(0));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert – the returned setActiveDataset is the store's setter
    expect(result.current.setActiveDataset).toBe(mockSetActiveDataset);
  });

  it("returns activeDatasetId from the data store", async () => {
    // Arrange
    mockActiveDatasetId = "store-id";
    mockListRegisteredDatasets.mockResolvedValue([]);

    // Act
    const { result } = renderHook(() => useDatasetCatalog(0));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert
    expect(result.current.activeDatasetId).toBe("store-id");
  });
});
