import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  useActiveDataset,
  useAddDataset,
  useAddQueryHistory,
  useAddTransform,
  useClearQueryHistory,
  useDataset,
  useDatasetByTable,
  useDatasets,
  useLoadedTableNames,
  useMarkTableLoaded,
  usePrefetchDataset,
  useQueryHistory,
  useRemoveChart,
  useRemoveDataset,
  useSaveChart,
  useSavedCharts,
  useSetActiveDataset,
  useTransforms,
  useUpdateDataset,
} from "@/core/queries/datasets";
import { queryKeys } from "@/core/queries/keys";
import type {
  Dataset,
  DataTransform,
  QueryHistoryItem,
  SavedChart,
} from "@/core/stores/data-store";
import { useDataStore } from "@/core/stores/data-store";
import { createTestQueryClient } from "../../test-utils";

// ─── Builders ──────────────────────────────────────────────────────────────────

const dataset = (overrides: Partial<Dataset> = {}): Dataset => ({
  id: overrides.id ?? "ds1",
  name: overrides.name ?? "Dataset",
  tableName: overrides.tableName ?? "table_ds1",
  viewName: overrides.viewName ?? overrides.tableName ?? "table_ds1",
  sourcePath: overrides.sourcePath,
  cachePath: overrides.cachePath,
  source: overrides.source ?? "upload",
  format: overrides.format ?? "csv",
  rowCount: overrides.rowCount ?? 10,
  colCount: overrides.colCount ?? 2,
  sizeBytes: overrides.sizeBytes ?? 1024,
  columns: overrides.columns ?? [],
  tags: overrides.tags ?? [],
  description: overrides.description ?? "",
  createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
  updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
  parentId: overrides.parentId,
  transformSql: overrides.transformSql,
  qualityScore: overrides.qualityScore ?? 0,
});

const historyItem = (overrides: Partial<QueryHistoryItem> = {}): QueryHistoryItem => ({
  id: overrides.id ?? "q1",
  sql: overrides.sql ?? "SELECT 1",
  naturalLanguage: overrides.naturalLanguage,
  datasetId: overrides.datasetId ?? "ds1",
  rowsReturned: overrides.rowsReturned ?? 1,
  durationMs: overrides.durationMs ?? 5,
  ranAt: overrides.ranAt ?? "2026-01-01T00:00:00.000Z",
  error: overrides.error,
});

const chart = (overrides: Partial<SavedChart> = {}): SavedChart => ({
  id: overrides.id ?? "c1",
  datasetId: overrides.datasetId ?? "ds1",
  title: overrides.title ?? "Chart",
  type: overrides.type ?? "bar",
  config: overrides.config ?? {},
  createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
});

const transform = (overrides: Partial<DataTransform> = {}): DataTransform => ({
  id: overrides.id ?? "t1",
  inputDatasetId: overrides.inputDatasetId ?? "ds1",
  outputDatasetId: overrides.outputDatasetId ?? "ds2",
  type: overrides.type ?? "filter",
  sql: overrides.sql ?? "SELECT 1",
  description: overrides.description ?? "",
  appliedAt: overrides.appliedAt ?? "2026-01-01T00:00:00.000Z",
});

// ─── Wrappers / helpers ──────────────────────────────────────────────────────

/** Fresh provider + client per hook render so the RQ cache is isolated. */
function makeWrapper(client: QueryClient = createTestQueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

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

beforeEach(() => {
  resetStore();
});

// ─── useDatasets ─────────────────────────────────────────────────────────────

describe("useDatasets", () => {
  it("returns all datasets when no filters are provided", async () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({ datasets: [dataset({ id: "a" }), dataset({ id: "b" })] });
    });

    const { result } = renderHook(() => useDatasets(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.map((d) => d.id)).toEqual(["a", "b"]);
  });

  it("returns an empty array when the store has no datasets", async () => {
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useDatasets(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("filters by source only", () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({
        datasets: [
          dataset({ id: "a", source: "upload" }),
          dataset({ id: "b", source: "catalog" }),
          dataset({ id: "c", source: "upload" }),
        ],
      });
    });

    const { result } = renderHook(() => useDatasets({ source: "upload" }), { wrapper });

    expect(result.current.data.map((d) => d.id)).toEqual(["a", "c"]);
  });

  it("filters by format only", () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({
        datasets: [dataset({ id: "a", format: "csv" }), dataset({ id: "b", format: "parquet" })],
      });
    });

    const { result } = renderHook(() => useDatasets({ format: "parquet" }), { wrapper });

    expect(result.current.data.map((d) => d.id)).toEqual(["b"]);
  });

  it("applies source AND format filters together", () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({
        datasets: [
          dataset({ id: "a", source: "upload", format: "csv" }),
          dataset({ id: "b", source: "upload", format: "parquet" }),
          dataset({ id: "c", source: "catalog", format: "csv" }),
        ],
      });
    });

    const { result } = renderHook(() => useDatasets({ source: "upload", format: "csv" }), {
      wrapper,
    });

    expect(result.current.data.map((d) => d.id)).toEqual(["a"]);
  });

  it("returns an empty array when filters match nothing", () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({ datasets: [dataset({ id: "a", source: "upload" })] });
    });

    const { result } = renderHook(() => useDatasets({ source: "catalog" }), { wrapper });

    expect(result.current.data).toEqual([]);
  });

  it("ignores filters whose value is an empty string (falsy)", () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({
        datasets: [dataset({ id: "a", source: "upload" }), dataset({ id: "b", source: "catalog" })],
      });
    });

    // Empty string is falsy so the `if (filters?.source)` branch is skipped.
    const { result } = renderHook(() => useDatasets({ source: "" }), { wrapper });

    expect(result.current.data.map((d) => d.id)).toEqual(["a", "b"]);
  });
});

// ─── useDataset ──────────────────────────────────────────────────────────────

describe("useDataset", () => {
  it("returns the matching dataset by id", async () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({
        datasets: [dataset({ id: "a", name: "Alpha" }), dataset({ id: "b" })],
      });
    });

    const { result } = renderHook(() => useDataset("a"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.name).toBe("Alpha");
  });

  it("returns null when the id is not present in the store", async () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({ datasets: [dataset({ id: "a" })] });
    });

    const { result } = renderHook(() => useDataset("missing"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("is disabled (idle) and does not fetch when id is null", () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({ datasets: [dataset({ id: "a" })] });
    });

    const { result } = renderHook(() => useDataset(null), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });
});

// ─── useDatasetByTable ───────────────────────────────────────────────────────

describe("useDatasetByTable", () => {
  it("returns the dataset matched by its tableName", async () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({
        datasets: [dataset({ id: "a", tableName: "t_a", viewName: "v_a" })],
      });
    });

    const { result } = renderHook(() => useDatasetByTable("t_a"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe("a");
  });

  it("also matches by viewName (getDatasetByTable checks both)", async () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({
        datasets: [dataset({ id: "a", tableName: "t_a", viewName: "v_a" })],
      });
    });

    const { result } = renderHook(() => useDatasetByTable("v_a"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe("a");
  });

  it("returns null when no table or view matches", async () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({ datasets: [dataset({ id: "a", tableName: "t_a" })] });
    });

    const { result } = renderHook(() => useDatasetByTable("nope"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("is disabled (idle) when tableName is null", () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({ datasets: [dataset({ id: "a", tableName: "t_a" })] });
    });

    const { result } = renderHook(() => useDatasetByTable(null), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });
});

// ─── useActiveDataset ────────────────────────────────────────────────────────

describe("useActiveDataset", () => {
  it("returns the active dataset resolved from the store", async () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({
        datasets: [dataset({ id: "a" }), dataset({ id: "b", name: "Active" })],
        activeDatasetId: "b",
      });
    });

    const { result } = renderHook(() => useActiveDataset(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.name).toBe("Active");
  });

  it("returns null when there is no active dataset id", async () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({ datasets: [dataset({ id: "a" })], activeDatasetId: null });
    });

    const { result } = renderHook(() => useActiveDataset(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("returns null when the active id points at a missing dataset", async () => {
    const { wrapper } = makeWrapper();
    act(() => {
      // activeDatasetId set but no matching dataset → getActiveDataset() is undefined → null
      useDataStore.setState({ datasets: [dataset({ id: "a" })], activeDatasetId: "ghost" });
    });

    const { result } = renderHook(() => useActiveDataset(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

// ─── useQueryHistory (query) ─────────────────────────────────────────────────

describe("useQueryHistory", () => {
  it("returns the full history when no datasetId is given", async () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({
        queryHistory: [historyItem({ id: "q1" }), historyItem({ id: "q2", datasetId: "other" })],
      });
    });

    const { result } = renderHook(() => useQueryHistory(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((q) => q.id)).toEqual(["q1", "q2"]);
  });

  it("filters history to a specific datasetId", async () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({
        queryHistory: [
          historyItem({ id: "q1", datasetId: "ds1" }),
          historyItem({ id: "q2", datasetId: "ds2" }),
          historyItem({ id: "q3", datasetId: "ds1" }),
        ],
      });
    });

    const { result } = renderHook(() => useQueryHistory("ds1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((q) => q.id)).toEqual(["q1", "q3"]);
  });

  it("returns an empty array when no history matches the datasetId", async () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({ queryHistory: [historyItem({ id: "q1", datasetId: "ds1" })] });
    });

    const { result } = renderHook(() => useQueryHistory("absent"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

// ─── useSavedCharts (query) ──────────────────────────────────────────────────

describe("useSavedCharts", () => {
  it("returns all saved charts when no datasetId is given", async () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({
        savedCharts: [chart({ id: "c1" }), chart({ id: "c2", datasetId: "other" })],
      });
    });

    const { result } = renderHook(() => useSavedCharts(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("filters charts by datasetId", async () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({
        savedCharts: [chart({ id: "c1", datasetId: "ds1" }), chart({ id: "c2", datasetId: "ds2" })],
      });
    });

    const { result } = renderHook(() => useSavedCharts("ds2"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((c) => c.id)).toEqual(["c2"]);
  });
});

// ─── useTransforms (query) ───────────────────────────────────────────────────

describe("useTransforms", () => {
  it("returns all transforms when no datasetId is given", async () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({
        transforms: [transform({ id: "t1" }), transform({ id: "t2", inputDatasetId: "other" })],
      });
    });

    const { result } = renderHook(() => useTransforms(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("filters transforms by their inputDatasetId", async () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({
        transforms: [
          transform({ id: "t1", inputDatasetId: "ds1" }),
          transform({ id: "t2", inputDatasetId: "ds2" }),
          transform({ id: "t3", inputDatasetId: "ds1" }),
        ],
      });
    });

    const { result } = renderHook(() => useTransforms("ds1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((t) => t.id)).toEqual(["t1", "t3"]);
  });
});

// ─── useLoadedTableNames (query) ─────────────────────────────────────────────

describe("useLoadedTableNames", () => {
  it("returns the loaded table names from the store", async () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({ loadedTableNames: ["t1", "t2"] });
    });

    const { result } = renderHook(() => useLoadedTableNames(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(["t1", "t2"]);
  });

  it("returns an empty array when nothing is loaded", async () => {
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useLoadedTableNames(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

// ─── useAddDataset (mutation) ────────────────────────────────────────────────

describe("useAddDataset", () => {
  it("adds the dataset to the store and returns it", async () => {
    const { wrapper } = makeWrapper();
    const ds = dataset({ id: "new", tableName: "t_new" });

    const { result } = renderHook(() => useAddDataset(), { wrapper });

    let returned: Dataset | undefined;
    await act(async () => {
      returned = await result.current.mutateAsync(ds);
    });

    expect(returned).toEqual(ds);
    expect(useDataStore.getState().datasets.map((d) => d.id)).toContain("new");
    // First dataset becomes active (activeDatasetId ?? dataset.id).
    expect(useDataStore.getState().activeDatasetId).toBe("new");
  });

  it("seeds the RQ detail + byTable caches via onSuccess", async () => {
    // This test asserts onSuccess *seeds* the caches, which is orthogonal to gc.
    // The default test client uses gcTime:0, so a seeded query with no observer
    // is evicted on a setTimeout(0) that fires while `await act` yields the event
    // loop — making any post-await read racy (reads undefined intermittently).
    // Use a non-evicting client here so the assertion observes the seed reliably.
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Number.POSITIVE_INFINITY, staleTime: 0 },
        mutations: { retry: false },
      },
    });
    const { wrapper } = makeWrapper(client);
    const ds = dataset({ id: "new", tableName: "t_new" });

    const { result } = renderHook(() => useAddDataset(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(ds);
    });

    expect(client.getQueryData(queryKeys.datasets.detail("new"))).toEqual(ds);
    expect(client.getQueryData(queryKeys.datasets.byTable("t_new"))).toEqual(ds);
  });
});

// ─── useUpdateDataset (mutation) ─────────────────────────────────────────────

describe("useUpdateDataset", () => {
  it("applies the patch to the matching dataset in the store", async () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({ datasets: [dataset({ id: "a", name: "Old" })] });
    });

    const { result } = renderHook(() => useUpdateDataset(), { wrapper });

    let returned: { id: string; patch: Partial<Dataset> } | undefined;
    await act(async () => {
      returned = await result.current.mutateAsync({ id: "a", patch: { name: "New" } });
    });

    expect(returned).toEqual({ id: "a", patch: { name: "New" } });
    const updated = useDataStore.getState().datasets.find((d) => d.id === "a");
    expect(updated?.name).toBe("New");
    // updateDataset stamps a fresh updatedAt.
    expect(updated?.updatedAt).not.toBe("2026-01-01T00:00:00.000Z");
  });

  it("leaves other datasets untouched when patching one", async () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({
        datasets: [dataset({ id: "a", name: "A" }), dataset({ id: "b", name: "B" })],
      });
    });

    const { result } = renderHook(() => useUpdateDataset(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: "a", patch: { description: "x" } });
    });

    expect(useDataStore.getState().datasets.find((d) => d.id === "b")?.name).toBe("B");
  });
});

// ─── useRemoveDataset (mutation) ─────────────────────────────────────────────

describe("useRemoveDataset", () => {
  it("removes the dataset from the store and returns the id", async () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({
        datasets: [dataset({ id: "a" }), dataset({ id: "b" })],
        activeDatasetId: "a",
      });
    });

    const { result } = renderHook(() => useRemoveDataset(), { wrapper });

    let returned: string | undefined;
    await act(async () => {
      returned = await result.current.mutateAsync("a");
    });

    expect(returned).toBe("a");
    expect(useDataStore.getState().datasets.map((d) => d.id)).toEqual(["b"]);
    // Removing the active dataset re-points active to the first remaining one.
    expect(useDataStore.getState().activeDatasetId).toBe("b");
  });

  it("removes the detail query from the RQ cache via onSuccess", async () => {
    const { client, wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({ datasets: [dataset({ id: "a" })] });
    });
    client.setQueryData(queryKeys.datasets.detail("a"), dataset({ id: "a" }));

    const { result } = renderHook(() => useRemoveDataset(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("a");
    });

    await waitFor(() => {
      expect(client.getQueryData(queryKeys.datasets.detail("a"))).toBeUndefined();
    });
  });
});

// ─── useSetActiveDataset (mutation) ──────────────────────────────────────────

describe("useSetActiveDataset", () => {
  it("sets the active dataset id in the store", async () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({
        datasets: [dataset({ id: "a" }), dataset({ id: "b" })],
        activeDatasetId: "a",
      });
    });

    const { result } = renderHook(() => useSetActiveDataset(), { wrapper });

    let returned: string | null | undefined;
    await act(async () => {
      returned = await result.current.mutateAsync("b");
    });

    expect(returned).toBe("b");
    expect(useDataStore.getState().activeDatasetId).toBe("b");
  });

  it("clears the active dataset when passed null", async () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({ datasets: [dataset({ id: "a" })], activeDatasetId: "a" });
    });

    const { result } = renderHook(() => useSetActiveDataset(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(null);
    });

    expect(useDataStore.getState().activeDatasetId).toBeNull();
  });
});

// ─── useAddQueryHistory (mutation) ───────────────────────────────────────────

describe("useAddQueryHistory", () => {
  it("prepends the history item to the store", async () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({ queryHistory: [historyItem({ id: "old" })] });
    });

    const { result } = renderHook(() => useAddQueryHistory(), { wrapper });

    const item = historyItem({ id: "fresh" });
    let returned: QueryHistoryItem | undefined;
    await act(async () => {
      returned = await result.current.mutateAsync(item);
    });

    expect(returned).toEqual(item);
    expect(useDataStore.getState().queryHistory.map((q) => q.id)).toEqual(["fresh", "old"]);
  });
});

// ─── useClearQueryHistory (mutation) ─────────────────────────────────────────

describe("useClearQueryHistory", () => {
  it("empties the query history in the store", async () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({
        queryHistory: [historyItem({ id: "q1" }), historyItem({ id: "q2" })],
      });
    });

    const { result } = renderHook(() => useClearQueryHistory(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(useDataStore.getState().queryHistory).toEqual([]);
  });
});

// ─── useSaveChart (mutation) ─────────────────────────────────────────────────

describe("useSaveChart", () => {
  it("prepends the chart to the store and returns it", async () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({ savedCharts: [chart({ id: "existing" })] });
    });

    const { result } = renderHook(() => useSaveChart(), { wrapper });

    const newChart = chart({ id: "new" });
    let returned: SavedChart | undefined;
    await act(async () => {
      returned = await result.current.mutateAsync(newChart);
    });

    expect(returned).toEqual(newChart);
    expect(useDataStore.getState().savedCharts.map((c) => c.id)).toEqual(["new", "existing"]);
  });
});

// ─── useRemoveChart (mutation) ───────────────────────────────────────────────

describe("useRemoveChart", () => {
  it("removes the chart by id and returns the id", async () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({
        savedCharts: [chart({ id: "c1" }), chart({ id: "c2" })],
      });
    });

    const { result } = renderHook(() => useRemoveChart(), { wrapper });

    let returned: string | undefined;
    await act(async () => {
      returned = await result.current.mutateAsync("c1");
    });

    expect(returned).toBe("c1");
    expect(useDataStore.getState().savedCharts.map((c) => c.id)).toEqual(["c2"]);
  });

  it("is a no-op when the chart id does not exist", async () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({ savedCharts: [chart({ id: "c1" })] });
    });

    const { result } = renderHook(() => useRemoveChart(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("ghost");
    });

    expect(useDataStore.getState().savedCharts.map((c) => c.id)).toEqual(["c1"]);
  });
});

// ─── useAddTransform (mutation) ──────────────────────────────────────────────

describe("useAddTransform", () => {
  it("prepends the transform to the store and returns it", async () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({ transforms: [transform({ id: "old" })] });
    });

    const { result } = renderHook(() => useAddTransform(), { wrapper });

    const newTransform = transform({ id: "new" });
    let returned: DataTransform | undefined;
    await act(async () => {
      returned = await result.current.mutateAsync(newTransform);
    });

    expect(returned).toEqual(newTransform);
    expect(useDataStore.getState().transforms.map((t) => t.id)).toEqual(["new", "old"]);
  });
});

// ─── useMarkTableLoaded (mutation) ───────────────────────────────────────────

describe("useMarkTableLoaded", () => {
  it("adds a new table name to loadedTableNames and returns it", async () => {
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useMarkTableLoaded(), { wrapper });

    let returned: string | undefined;
    await act(async () => {
      returned = await result.current.mutateAsync("t_new");
    });

    expect(returned).toBe("t_new");
    expect(useDataStore.getState().loadedTableNames).toContain("t_new");
  });

  it("does not duplicate an already-loaded table name", async () => {
    const { wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({ loadedTableNames: ["t_existing"] });
    });

    const { result } = renderHook(() => useMarkTableLoaded(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("t_existing");
    });

    expect(useDataStore.getState().loadedTableNames).toEqual(["t_existing"]);
  });
});

// ─── usePrefetchDataset (callback) ───────────────────────────────────────────

describe("usePrefetchDataset", () => {
  it("seeds the RQ detail cache when the dataset exists in the store", () => {
    const { client, wrapper } = makeWrapper();
    const ds = dataset({ id: "a" });
    act(() => {
      useDataStore.setState({ datasets: [ds] });
    });

    const { result } = renderHook(() => usePrefetchDataset(), { wrapper });

    act(() => {
      result.current("a");
    });

    expect(client.getQueryData(queryKeys.datasets.detail("a"))).toEqual(ds);
  });

  it("does nothing when the dataset id is not found", () => {
    const { client, wrapper } = makeWrapper();
    act(() => {
      useDataStore.setState({ datasets: [dataset({ id: "a" })] });
    });

    const { result } = renderHook(() => usePrefetchDataset(), { wrapper });

    act(() => {
      result.current("missing");
    });

    expect(client.getQueryData(queryKeys.datasets.detail("missing"))).toBeUndefined();
  });

  it("returns a stable callback reference across re-renders", () => {
    const { wrapper } = makeWrapper();

    const { result, rerender } = renderHook(() => usePrefetchDataset(), { wrapper });
    const first = result.current;
    rerender();

    expect(result.current).toBe(first);
  });
});
