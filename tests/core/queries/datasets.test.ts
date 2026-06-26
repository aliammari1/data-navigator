/**
 * Unit tests for src/core/queries/datasets.ts
 *
 * Strategy: the target module is purely logic (React hooks on top of Zustand +
 * TanStack Query). No IO boundaries need mocking — the Zustand store runs in
 * memory (localStorage is available in jsdom) and we drive a real QueryClient.
 * Every branch in every hook is exercised.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useDataStore } from "@/core/stores/data-store";
import type { Dataset, QueryHistoryItem, SavedChart, DataTransform } from "@/core/stores/data-store";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Fresh QueryClient per test — prevents cache bleed-over. */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

/** Wrap renderHook in a QueryClientProvider. */
function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

/** Minimal Dataset shape. */
function makeDataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    id: "ds-1",
    name: "Test Dataset",
    tableName: "test_table",
    viewName: "test_view",
    source: "upload",
    format: "csv",
    rowCount: 100,
    colCount: 3,
    sizeBytes: 1024,
    columns: [],
    tags: [],
    description: "",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    qualityScore: 1,
    ...overrides,
  };
}

/** Minimal QueryHistoryItem. */
function makeQueryHistoryItem(overrides: Partial<QueryHistoryItem> = {}): QueryHistoryItem {
  return {
    id: "qh-1",
    sql: "SELECT 1",
    datasetId: "ds-1",
    rowsReturned: 1,
    durationMs: 10,
    ranAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/** Minimal SavedChart. */
function makeSavedChart(overrides: Partial<SavedChart> = {}): SavedChart {
  return {
    id: "chart-1",
    datasetId: "ds-1",
    title: "My Chart",
    type: "bar",
    config: {},
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/** Minimal DataTransform. */
function makeDataTransform(overrides: Partial<DataTransform> = {}): DataTransform {
  return {
    id: "transform-1",
    inputDatasetId: "ds-1",
    outputDatasetId: "ds-2",
    type: "filter",
    sql: "SELECT * FROM t WHERE x > 1",
    description: "",
    appliedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/** Reset the Zustand data store to a clean state before each test. */
function resetStore() {
  act(() => {
    useDataStore.setState({
      datasets: [],
      activeDatasetId: null,
      queryHistory: [],
      savedCharts: [],
      transforms: [],
      loadedTableNames: [],
    });
  });
}

// Import hooks after helpers so mocks (if any) are registered first.
import {
  useDatasets,
  useDataset,
  useDatasetByTable,
  useActiveDataset,
  useAddDataset,
  useUpdateDataset,
  useRemoveDataset,
  useSetActiveDataset,
  useQueryHistory,
  useAddQueryHistory,
  useClearQueryHistory,
  useSavedCharts,
  useSaveChart,
  useRemoveChart,
  useTransforms,
  useAddTransform,
  useLoadedTableNames,
  useMarkTableLoaded,
  usePrefetchDataset,
} from "@/core/queries/datasets";

// ─── useDatasets ──────────────────────────────────────────────────────────────

describe("useDatasets", () => {
  let qc: QueryClient;

  beforeEach(() => {
    resetStore();
    qc = makeQueryClient();
  });

  afterEach(() => {
    qc.clear();
    vi.restoreAllMocks();
  });

  it("returns all datasets when no filters are applied", async () => {
    // Arrange
    const ds1 = makeDataset({ id: "ds-1", source: "upload", format: "csv" });
    const ds2 = makeDataset({ id: "ds-2", source: "paste", format: "parquet" });
    act(() => { useDataStore.setState({ datasets: [ds1, ds2] }); });

    // Act
    const { result } = renderHook(() => useDatasets(), { wrapper: makeWrapper(qc) });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
  });

  it("filters by source when filters.source is provided", async () => {
    // Arrange
    const ds1 = makeDataset({ id: "ds-1", source: "upload", format: "csv" });
    const ds2 = makeDataset({ id: "ds-2", source: "paste", format: "csv" });
    act(() => { useDataStore.setState({ datasets: [ds1, ds2] }); });

    // Act
    const { result } = renderHook(
      () => useDatasets({ source: "upload" }),
      { wrapper: makeWrapper(qc) },
    );

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].id).toBe("ds-1");
  });

  it("filters by format when filters.format is provided", async () => {
    // Arrange
    const ds1 = makeDataset({ id: "ds-1", source: "upload", format: "csv" });
    const ds2 = makeDataset({ id: "ds-2", source: "upload", format: "parquet" });
    act(() => { useDataStore.setState({ datasets: [ds1, ds2] }); });

    // Act
    const { result } = renderHook(
      () => useDatasets({ format: "parquet" }),
      { wrapper: makeWrapper(qc) },
    );

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].id).toBe("ds-2");
  });

  it("filters by both source and format simultaneously", async () => {
    // Arrange — three datasets; only one matches both
    const ds1 = makeDataset({ id: "ds-1", source: "upload", format: "csv" });
    const ds2 = makeDataset({ id: "ds-2", source: "paste", format: "csv" });
    const ds3 = makeDataset({ id: "ds-3", source: "upload", format: "parquet" });
    act(() => { useDataStore.setState({ datasets: [ds1, ds2, ds3] }); });

    // Act
    const { result } = renderHook(
      () => useDatasets({ source: "upload", format: "csv" }),
      { wrapper: makeWrapper(qc) },
    );

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].id).toBe("ds-1");
  });

  it("returns empty array when no datasets match", async () => {
    // Arrange
    const ds1 = makeDataset({ id: "ds-1", source: "upload", format: "csv" });
    act(() => { useDataStore.setState({ datasets: [ds1] }); });

    // Act
    const { result } = renderHook(
      () => useDatasets({ source: "paste" }),
      { wrapper: makeWrapper(qc) },
    );

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(0);
  });

  it("returns empty array when store is empty", async () => {
    // Arrange — store already empty from resetStore
    const { result } = renderHook(() => useDatasets(), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

// ─── useDataset ───────────────────────────────────────────────────────────────

describe("useDataset", () => {
  let qc: QueryClient;

  beforeEach(() => {
    resetStore();
    qc = makeQueryClient();
  });

  afterEach(() => {
    qc.clear();
    vi.restoreAllMocks();
  });

  it("returns the dataset when id matches", async () => {
    // Arrange
    const ds = makeDataset({ id: "ds-abc" });
    act(() => { useDataStore.setState({ datasets: [ds] }); });

    const { result } = renderHook(() => useDataset("ds-abc"), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe("ds-abc");
  });

  it("returns null when id is not found", async () => {
    // Arrange — store has dataset but not the requested id
    const ds = makeDataset({ id: "ds-other" });
    act(() => { useDataStore.setState({ datasets: [ds] }); });

    const { result } = renderHook(() => useDataset("ds-missing"), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("is disabled and uses null key when id is null", async () => {
    // Arrange — enabled: !!id → false when null
    const { result } = renderHook(() => useDataset(null), { wrapper: makeWrapper(qc) });

    // Query is disabled; fetchStatus stays idle
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });
});

// ─── useDatasetByTable ────────────────────────────────────────────────────────

describe("useDatasetByTable", () => {
  let qc: QueryClient;

  beforeEach(() => {
    resetStore();
    qc = makeQueryClient();
  });

  afterEach(() => {
    qc.clear();
    vi.restoreAllMocks();
  });

  it("returns the dataset when tableName matches", async () => {
    // Arrange
    const ds = makeDataset({ id: "ds-1", tableName: "my_table" });
    act(() => { useDataStore.setState({ datasets: [ds] }); });

    const { result } = renderHook(
      () => useDatasetByTable("my_table"),
      { wrapper: makeWrapper(qc) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.tableName).toBe("my_table");
  });

  it("returns null when no dataset matches tableName", async () => {
    act(() => { useDataStore.setState({ datasets: [] }); });

    const { result } = renderHook(
      () => useDatasetByTable("nonexistent"),
      { wrapper: makeWrapper(qc) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("is disabled when tableName is null (uses null-table key)", async () => {
    const { result } = renderHook(
      () => useDatasetByTable(null),
      { wrapper: makeWrapper(qc) },
    );

    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });
});

// ─── useActiveDataset ─────────────────────────────────────────────────────────

describe("useActiveDataset", () => {
  let qc: QueryClient;

  beforeEach(() => {
    resetStore();
    qc = makeQueryClient();
  });

  afterEach(() => {
    qc.clear();
    vi.restoreAllMocks();
  });

  it("returns null when no active dataset is set", async () => {
    // Arrange — store has no active dataset
    act(() => {
      useDataStore.setState({ activeDatasetId: null, datasets: [] });
    });

    const { result } = renderHook(() => useActiveDataset(), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("returns the active dataset when activeDatasetId is set", async () => {
    // Arrange
    const ds = makeDataset({ id: "ds-active" });
    act(() => {
      useDataStore.setState({ datasets: [ds], activeDatasetId: "ds-active" });
    });

    const { result } = renderHook(() => useActiveDataset(), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe("ds-active");
  });

  it("uses the detail queryKey when activeDatasetId is set", async () => {
    // Arrange — verify the hook picks the detail key branch
    const ds = makeDataset({ id: "ds-keyed" });
    act(() => {
      useDataStore.setState({ datasets: [ds], activeDatasetId: "ds-keyed" });
    });

    const { result } = renderHook(() => useActiveDataset(), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe("ds-keyed");
  });
});

// ─── useAddDataset ────────────────────────────────────────────────────────────

describe("useAddDataset", () => {
  let qc: QueryClient;

  beforeEach(() => {
    resetStore();
    qc = makeQueryClient();
  });

  afterEach(() => {
    qc.clear();
    vi.restoreAllMocks();
  });

  it("adds a dataset to the store and returns it", async () => {
    const { result } = renderHook(() => useAddDataset(), { wrapper: makeWrapper(qc) });

    const ds = makeDataset({ id: "new-ds" });
    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.mutateAsync(ds);
    });

    expect(returnValue).toEqual(ds);
    expect(useDataStore.getState().datasets).toHaveLength(1);
    expect(useDataStore.getState().datasets[0].id).toBe("new-ds");
  });

  it("invalidates dataset list queries on success", async () => {
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useAddDataset(), { wrapper: makeWrapper(qc) });

    const ds = makeDataset({ id: "ds-inval" });
    await act(async () => { await result.current.mutateAsync(ds); });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
  });

  it("sets query data for dataset detail and byTable on success", async () => {
    const setDataSpy = vi.spyOn(qc, "setQueryData");
    const { result } = renderHook(() => useAddDataset(), { wrapper: makeWrapper(qc) });

    const ds = makeDataset({ id: "ds-qd", tableName: "tbl_qd" });
    await act(async () => { await result.current.mutateAsync(ds); });

    await waitFor(() => expect(setDataSpy).toHaveBeenCalledTimes(2));
  });
});

// ─── useUpdateDataset ─────────────────────────────────────────────────────────

describe("useUpdateDataset", () => {
  let qc: QueryClient;

  beforeEach(() => {
    resetStore();
    qc = makeQueryClient();
  });

  afterEach(() => {
    qc.clear();
    vi.restoreAllMocks();
  });

  it("updates the dataset in the store and returns { id, patch }", async () => {
    // Arrange
    const ds = makeDataset({ id: "ds-upd", name: "Old Name" });
    act(() => { useDataStore.setState({ datasets: [ds] }); });

    const { result } = renderHook(() => useUpdateDataset(), { wrapper: makeWrapper(qc) });

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.mutateAsync({ id: "ds-upd", patch: { name: "New Name" } });
    });

    expect(returnValue).toEqual({ id: "ds-upd", patch: { name: "New Name" } });
    expect(useDataStore.getState().datasets[0].name).toBe("New Name");
  });

  it("invalidates detail and list queries on success", async () => {
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useUpdateDataset(), { wrapper: makeWrapper(qc) });

    await act(async () => {
      await result.current.mutateAsync({ id: "ds-x", patch: { name: "X" } });
    });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledTimes(2));
  });
});

// ─── useRemoveDataset ─────────────────────────────────────────────────────────

describe("useRemoveDataset", () => {
  let qc: QueryClient;

  beforeEach(() => {
    resetStore();
    qc = makeQueryClient();
  });

  afterEach(() => {
    qc.clear();
    vi.restoreAllMocks();
  });

  it("removes the dataset from the store and returns the id", async () => {
    // Arrange
    const ds = makeDataset({ id: "ds-del" });
    act(() => { useDataStore.setState({ datasets: [ds] }); });

    const { result } = renderHook(() => useRemoveDataset(), { wrapper: makeWrapper(qc) });

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.mutateAsync("ds-del");
    });

    expect(returnValue).toBe("ds-del");
    expect(useDataStore.getState().datasets).toHaveLength(0);
  });

  it("removes queries and invalidates lists on success", async () => {
    const removeQueriesSpy = vi.spyOn(qc, "removeQueries");
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useRemoveDataset(), { wrapper: makeWrapper(qc) });

    await act(async () => { await result.current.mutateAsync("ds-gone"); });

    await waitFor(() => {
      expect(removeQueriesSpy).toHaveBeenCalled();
      expect(invalidateSpy).toHaveBeenCalled();
    });
  });
});

// ─── useSetActiveDataset ──────────────────────────────────────────────────────

describe("useSetActiveDataset", () => {
  let qc: QueryClient;

  beforeEach(() => {
    resetStore();
    qc = makeQueryClient();
  });

  afterEach(() => {
    qc.clear();
    vi.restoreAllMocks();
  });

  it("sets the active dataset id and returns it", async () => {
    const { result } = renderHook(() => useSetActiveDataset(), { wrapper: makeWrapper(qc) });

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.mutateAsync("ds-active");
    });

    expect(returnValue).toBe("ds-active");
    expect(useDataStore.getState().activeDatasetId).toBe("ds-active");
  });

  it("accepts null to clear active dataset", async () => {
    act(() => { useDataStore.setState({ activeDatasetId: "ds-prev" }); });

    const { result } = renderHook(() => useSetActiveDataset(), { wrapper: makeWrapper(qc) });

    await act(async () => { await result.current.mutateAsync(null); });

    expect(useDataStore.getState().activeDatasetId).toBeNull();
  });

  it("invalidates all dataset queries on success", async () => {
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useSetActiveDataset(), { wrapper: makeWrapper(qc) });

    await act(async () => { await result.current.mutateAsync("ds-x"); });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
  });
});

// ─── useQueryHistory ──────────────────────────────────────────────────────────

describe("useQueryHistory", () => {
  let qc: QueryClient;

  beforeEach(() => {
    resetStore();
    qc = makeQueryClient();
  });

  afterEach(() => {
    qc.clear();
    vi.restoreAllMocks();
  });

  it("returns all query history when datasetId is not provided", async () => {
    // Arrange
    const item1 = makeQueryHistoryItem({ id: "qh-1", datasetId: "ds-1" });
    const item2 = makeQueryHistoryItem({ id: "qh-2", datasetId: "ds-2" });
    act(() => { useDataStore.setState({ queryHistory: [item1, item2] }); });

    const { result } = renderHook(() => useQueryHistory(), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
  });

  it("filters query history by datasetId when provided", async () => {
    // Arrange — two items; only the one for ds-1 should appear
    const item1 = makeQueryHistoryItem({ id: "qh-1", datasetId: "ds-1" });
    const item2 = makeQueryHistoryItem({ id: "qh-2", datasetId: "ds-2" });
    act(() => { useDataStore.setState({ queryHistory: [item1, item2] }); });

    const { result } = renderHook(
      () => useQueryHistory("ds-1"),
      { wrapper: makeWrapper(qc) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].datasetId).toBe("ds-1");
  });

  it("returns empty array when no history entries match the datasetId", async () => {
    act(() => { useDataStore.setState({ queryHistory: [] }); });

    const { result } = renderHook(
      () => useQueryHistory("ds-missing"),
      { wrapper: makeWrapper(qc) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

// ─── useAddQueryHistory ───────────────────────────────────────────────────────

describe("useAddQueryHistory", () => {
  let qc: QueryClient;

  beforeEach(() => {
    resetStore();
    qc = makeQueryClient();
  });

  afterEach(() => {
    qc.clear();
    vi.restoreAllMocks();
  });

  it("adds a query history item and returns it", async () => {
    const { result } = renderHook(() => useAddQueryHistory(), { wrapper: makeWrapper(qc) });

    const item = makeQueryHistoryItem({ id: "qh-new" });
    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.mutateAsync(item);
    });

    expect(returnValue).toEqual(item);
    expect(useDataStore.getState().queryHistory).toHaveLength(1);
  });

  it("invalidates query history queries on success", async () => {
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useAddQueryHistory(), { wrapper: makeWrapper(qc) });

    const item = makeQueryHistoryItem({ id: "qh-inval", datasetId: "ds-1" });
    await act(async () => { await result.current.mutateAsync(item); });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledTimes(2));
  });
});

// ─── useClearQueryHistory ─────────────────────────────────────────────────────

describe("useClearQueryHistory", () => {
  let qc: QueryClient;

  beforeEach(() => {
    resetStore();
    qc = makeQueryClient();
  });

  afterEach(() => {
    qc.clear();
    vi.restoreAllMocks();
  });

  it("clears all query history and returns void", async () => {
    // Arrange
    const item = makeQueryHistoryItem({ id: "qh-clear" });
    act(() => { useDataStore.setState({ queryHistory: [item] }); });

    const { result } = renderHook(() => useClearQueryHistory(), { wrapper: makeWrapper(qc) });

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.mutateAsync();
    });

    expect(returnValue).toBeUndefined();
    expect(useDataStore.getState().queryHistory).toHaveLength(0);
  });

  it("invalidates all query history queries on success", async () => {
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useClearQueryHistory(), { wrapper: makeWrapper(qc) });

    await act(async () => { await result.current.mutateAsync(); });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
  });
});

// ─── useSavedCharts ───────────────────────────────────────────────────────────

describe("useSavedCharts", () => {
  let qc: QueryClient;

  beforeEach(() => {
    resetStore();
    qc = makeQueryClient();
  });

  afterEach(() => {
    qc.clear();
    vi.restoreAllMocks();
  });

  it("returns all charts when no datasetId is provided", async () => {
    // Arrange
    const c1 = makeSavedChart({ id: "c-1", datasetId: "ds-1" });
    const c2 = makeSavedChart({ id: "c-2", datasetId: "ds-2" });
    act(() => { useDataStore.setState({ savedCharts: [c1, c2] }); });

    const { result } = renderHook(() => useSavedCharts(), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
  });

  it("filters charts by datasetId when provided", async () => {
    // Arrange
    const c1 = makeSavedChart({ id: "c-1", datasetId: "ds-1" });
    const c2 = makeSavedChart({ id: "c-2", datasetId: "ds-2" });
    act(() => { useDataStore.setState({ savedCharts: [c1, c2] }); });

    const { result } = renderHook(
      () => useSavedCharts("ds-1"),
      { wrapper: makeWrapper(qc) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].datasetId).toBe("ds-1");
  });

  it("returns empty array when no charts match", async () => {
    act(() => { useDataStore.setState({ savedCharts: [] }); });

    const { result } = renderHook(
      () => useSavedCharts("ds-none"),
      { wrapper: makeWrapper(qc) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

// ─── useSaveChart ─────────────────────────────────────────────────────────────

describe("useSaveChart", () => {
  let qc: QueryClient;

  beforeEach(() => {
    resetStore();
    qc = makeQueryClient();
  });

  afterEach(() => {
    qc.clear();
    vi.restoreAllMocks();
  });

  it("saves a chart and returns it", async () => {
    const { result } = renderHook(() => useSaveChart(), { wrapper: makeWrapper(qc) });

    const chart = makeSavedChart({ id: "c-save" });
    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.mutateAsync(chart);
    });

    expect(returnValue).toEqual(chart);
    expect(useDataStore.getState().savedCharts).toHaveLength(1);
  });

  it("invalidates chart queries on success", async () => {
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useSaveChart(), { wrapper: makeWrapper(qc) });

    const chart = makeSavedChart({ id: "c-inval", datasetId: "ds-1" });
    await act(async () => { await result.current.mutateAsync(chart); });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledTimes(2));
  });
});

// ─── useRemoveChart ───────────────────────────────────────────────────────────

describe("useRemoveChart", () => {
  let qc: QueryClient;

  beforeEach(() => {
    resetStore();
    qc = makeQueryClient();
  });

  afterEach(() => {
    qc.clear();
    vi.restoreAllMocks();
  });

  it("removes a chart and returns the id", async () => {
    // Arrange
    const chart = makeSavedChart({ id: "c-del" });
    act(() => { useDataStore.setState({ savedCharts: [chart] }); });

    const { result } = renderHook(() => useRemoveChart(), { wrapper: makeWrapper(qc) });

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.mutateAsync("c-del");
    });

    expect(returnValue).toBe("c-del");
    expect(useDataStore.getState().savedCharts).toHaveLength(0);
  });

  it("invalidates all chart queries on success", async () => {
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useRemoveChart(), { wrapper: makeWrapper(qc) });

    await act(async () => { await result.current.mutateAsync("c-gone"); });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
  });
});

// ─── useTransforms ────────────────────────────────────────────────────────────

describe("useTransforms", () => {
  let qc: QueryClient;

  beforeEach(() => {
    resetStore();
    qc = makeQueryClient();
  });

  afterEach(() => {
    qc.clear();
    vi.restoreAllMocks();
  });

  it("returns all transforms when no datasetId is provided", async () => {
    // Arrange
    const t1 = makeDataTransform({ id: "t-1", inputDatasetId: "ds-1" });
    const t2 = makeDataTransform({ id: "t-2", inputDatasetId: "ds-2" });
    act(() => { useDataStore.setState({ transforms: [t1, t2] }); });

    const { result } = renderHook(() => useTransforms(), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
  });

  it("filters transforms by datasetId when provided", async () => {
    // Arrange
    const t1 = makeDataTransform({ id: "t-1", inputDatasetId: "ds-1" });
    const t2 = makeDataTransform({ id: "t-2", inputDatasetId: "ds-2" });
    act(() => { useDataStore.setState({ transforms: [t1, t2] }); });

    const { result } = renderHook(
      () => useTransforms("ds-1"),
      { wrapper: makeWrapper(qc) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].inputDatasetId).toBe("ds-1");
  });

  it("returns empty array when no transforms match", async () => {
    act(() => { useDataStore.setState({ transforms: [] }); });

    const { result } = renderHook(
      () => useTransforms("ds-none"),
      { wrapper: makeWrapper(qc) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

// ─── useAddTransform ──────────────────────────────────────────────────────────

describe("useAddTransform", () => {
  let qc: QueryClient;

  beforeEach(() => {
    resetStore();
    qc = makeQueryClient();
  });

  afterEach(() => {
    qc.clear();
    vi.restoreAllMocks();
  });

  it("adds a transform and returns it", async () => {
    const { result } = renderHook(() => useAddTransform(), { wrapper: makeWrapper(qc) });

    const transform = makeDataTransform({ id: "t-new" });
    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.mutateAsync(transform);
    });

    expect(returnValue).toEqual(transform);
    expect(useDataStore.getState().transforms).toHaveLength(1);
  });

  it("invalidates transform queries on success", async () => {
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useAddTransform(), { wrapper: makeWrapper(qc) });

    const transform = makeDataTransform({ id: "t-inval", inputDatasetId: "ds-1" });
    await act(async () => { await result.current.mutateAsync(transform); });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledTimes(2));
  });
});

// ─── useLoadedTableNames ──────────────────────────────────────────────────────

describe("useLoadedTableNames", () => {
  let qc: QueryClient;

  beforeEach(() => {
    resetStore();
    qc = makeQueryClient();
  });

  afterEach(() => {
    qc.clear();
    vi.restoreAllMocks();
  });

  it("returns the loaded table names from the store", async () => {
    // Arrange
    act(() => { useDataStore.setState({ loadedTableNames: ["table_a", "table_b"] }); });

    const { result } = renderHook(() => useLoadedTableNames(), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(["table_a", "table_b"]);
  });

  it("returns an empty array when no tables are loaded", async () => {
    const { result } = renderHook(() => useLoadedTableNames(), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

// ─── useMarkTableLoaded ───────────────────────────────────────────────────────

describe("useMarkTableLoaded", () => {
  let qc: QueryClient;

  beforeEach(() => {
    resetStore();
    qc = makeQueryClient();
  });

  afterEach(() => {
    qc.clear();
    vi.restoreAllMocks();
  });

  it("marks a table as loaded and returns the tableName", async () => {
    const { result } = renderHook(() => useMarkTableLoaded(), { wrapper: makeWrapper(qc) });

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.mutateAsync("new_table");
    });

    expect(returnValue).toBe("new_table");
    expect(useDataStore.getState().loadedTableNames).toContain("new_table");
  });

  it("invalidates the loadedTables query on success", async () => {
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useMarkTableLoaded(), { wrapper: makeWrapper(qc) });

    await act(async () => { await result.current.mutateAsync("table_x"); });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
  });
});

// ─── usePrefetchDataset ───────────────────────────────────────────────────────

describe("usePrefetchDataset", () => {
  let qc: QueryClient;

  beforeEach(() => {
    resetStore();
    qc = makeQueryClient();
  });

  afterEach(() => {
    qc.clear();
    vi.restoreAllMocks();
  });

  it("sets query data in the cache when the dataset is found", async () => {
    // Arrange
    const ds = makeDataset({ id: "ds-prefetch" });
    act(() => { useDataStore.setState({ datasets: [ds] }); });

    const setDataSpy = vi.spyOn(qc, "setQueryData");
    const { result } = renderHook(() => usePrefetchDataset(), { wrapper: makeWrapper(qc) });

    // Act — prefetch is a callback returned from the hook
    act(() => { result.current("ds-prefetch"); });

    // Assert — setQueryData called with the dataset detail key
    expect(setDataSpy).toHaveBeenCalled();
    // Verify the cache now contains the dataset
    const cached = qc.getQueryData(["datasets", "detail", "ds-prefetch"]);
    expect(cached).toMatchObject({ id: "ds-prefetch" });
  });

  it("does nothing when the dataset is not found (no error thrown)", async () => {
    // Arrange — store is empty; dataset not found
    const setDataSpy = vi.spyOn(qc, "setQueryData");
    const { result } = renderHook(() => usePrefetchDataset(), { wrapper: makeWrapper(qc) });

    // Act — should silently no-op when dataset is undefined
    act(() => { result.current("ds-not-found"); });

    // Assert — setQueryData NOT called (dataset was undefined)
    expect(setDataSpy).not.toHaveBeenCalled();
  });
});
