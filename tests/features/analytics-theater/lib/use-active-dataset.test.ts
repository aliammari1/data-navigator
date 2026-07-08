import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Dataset, ColMeta } from "@/core/stores/data-store";
import { useDataStore } from "@/core/stores/data-store";
import { useActiveDataset } from "@/features/analytics-theater/lib/use-active-dataset";

// ─── Store reset helpers ─────────────────────────────────────────────────────

const PRISTINE = {
  datasets: [] as Dataset[],
  activeDatasetId: null as string | null,
};

function resetStore() {
  useDataStore.setState(PRISTINE);
}

// ─── Fixture builders ────────────────────────────────────────────────────────

function makeCol(overrides: Partial<ColMeta> = {}): ColMeta {
  return {
    name: overrides.name ?? "col",
    type: overrides.type ?? "string",
    nullCount: 0,
    distinctCount: overrides.distinctCount ?? 0,
    sample: [],
    ...overrides,
  };
}

function makeDataset(overrides: Partial<Dataset> = {}): Dataset {
  const id = overrides.id ?? "ds_1";
  return {
    id,
    name: overrides.name ?? "Test Dataset",
    tableName: overrides.tableName ?? `tbl_${id}`,
    viewName: overrides.viewName ?? `view_${id}`,
    source: "upload",
    format: "csv",
    rowCount: overrides.rowCount ?? 100,
    colCount: 1,
    sizeBytes: 1024,
    tags: [],
    description: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    qualityScore: 0,
    columns: overrides.columns ?? [makeCol()],
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("useActiveDataset", () => {
  beforeEach(() => {
    resetStore();
  });

  // ── Empty store (no datasets) ──────────────────────────────────────────────

  it("returns null fields and ready=false when no datasets exist", () => {
    const { result } = renderHook(() => useActiveDataset());

    expect(result.current.datasetId).toBeNull();
    expect(result.current.name).toBeNull();
    expect(result.current.view).toBeNull();
    expect(result.current.rowCount).toBe(0);
    expect(result.current.ready).toBe(false);
  });

  it("returns empty roles when no datasets exist", () => {
    const { result } = renderHook(() => useActiveDataset());

    expect(result.current.roles.date).toBeNull();
    expect(result.current.roles.measure).toBeNull();
    expect(result.current.roles.category).toBeNull();
    expect(result.current.roles.category2).toBeNull();
    expect(result.current.roles.text).toBeNull();
    expect(result.current.roles.numeric).toEqual([]);
    expect(result.current.roles.strings).toEqual([]);
  });

  // ── Active dataset found by activeDatasetId ──────────────────────────────

  it("resolves the dataset matching activeDatasetId", () => {
    const ds1 = makeDataset({ id: "ds_a", name: "Alpha" });
    const ds2 = makeDataset({ id: "ds_b", name: "Beta" });
    useDataStore.setState({ datasets: [ds1, ds2], activeDatasetId: "ds_b" });

    const { result } = renderHook(() => useActiveDataset());

    expect(result.current.datasetId).toBe("ds_b");
    expect(result.current.name).toBe("Beta");
  });

  it("returns ready=true and the view when the active dataset has a viewName", () => {
    const ds = makeDataset({ id: "ds_1", viewName: "my_view", tableName: "my_table" });
    useDataStore.setState({ datasets: [ds], activeDatasetId: "ds_1" });

    const { result } = renderHook(() => useActiveDataset());

    expect(result.current.view).toBe("my_view");
    expect(result.current.ready).toBe(true);
  });

  it("falls back to tableName when viewName is an empty string", () => {
    const ds = makeDataset({ id: "ds_1", viewName: "", tableName: "fallback_table" });
    useDataStore.setState({ datasets: [ds], activeDatasetId: "ds_1" });

    const { result } = renderHook(() => useActiveDataset());

    expect(result.current.view).toBe("fallback_table");
    expect(result.current.ready).toBe(true);
  });

  it("returns view=null and ready=false when both viewName and tableName are empty", () => {
    const ds = makeDataset({ id: "ds_1", viewName: "", tableName: "" });
    useDataStore.setState({ datasets: [ds], activeDatasetId: "ds_1" });

    const { result } = renderHook(() => useActiveDataset());

    expect(result.current.view).toBeNull();
    expect(result.current.ready).toBe(false);
  });

  it("returns the rowCount from the active dataset", () => {
    const ds = makeDataset({ id: "ds_1", rowCount: 42 });
    useDataStore.setState({ datasets: [ds], activeDatasetId: "ds_1" });

    const { result } = renderHook(() => useActiveDataset());

    expect(result.current.rowCount).toBe(42);
  });

  // ── Fallback to datasets[0] when no activeDatasetId matches ──────────────

  it("falls back to datasets[0] when activeDatasetId is null", () => {
    const ds1 = makeDataset({ id: "ds_a", name: "First" });
    const ds2 = makeDataset({ id: "ds_b", name: "Second" });
    useDataStore.setState({ datasets: [ds1, ds2], activeDatasetId: null });

    const { result } = renderHook(() => useActiveDataset());

    expect(result.current.datasetId).toBe("ds_a");
    expect(result.current.name).toBe("First");
  });

  it("falls back to datasets[0] when activeDatasetId does not match any dataset", () => {
    const ds = makeDataset({ id: "ds_real", name: "Real" });
    useDataStore.setState({ datasets: [ds], activeDatasetId: "ds_ghost" });

    const { result } = renderHook(() => useActiveDataset());

    // find() returns undefined → fallback to datasets[0]
    expect(result.current.datasetId).toBe("ds_real");
    expect(result.current.name).toBe("Real");
  });

  // ── Column roles detection ────────────────────────────────────────────────

  it("detects numeric columns in roles", () => {
    const ds = makeDataset({
      id: "ds_1",
      columns: [
        makeCol({ name: "amount", type: "number" }),
        makeCol({ name: "channel", type: "string" }),
      ],
    });
    useDataStore.setState({ datasets: [ds], activeDatasetId: "ds_1" });

    const { result } = renderHook(() => useActiveDataset());

    expect(result.current.roles.measure?.name).toBe("amount");
    expect(result.current.roles.numeric).toHaveLength(1);
    expect(result.current.roles.strings).toHaveLength(1);
  });

  it("detects a date column in roles", () => {
    const ds = makeDataset({
      id: "ds_1",
      columns: [
        makeCol({ name: "date", type: "date" }),
        makeCol({ name: "amount", type: "number" }),
      ],
    });
    useDataStore.setState({ datasets: [ds], activeDatasetId: "ds_1" });

    const { result } = renderHook(() => useActiveDataset());

    expect(result.current.roles.date?.name).toBe("date");
  });

  it("returns null roles when dataset has no columns", () => {
    const ds = makeDataset({ id: "ds_1", columns: [] });
    useDataStore.setState({ datasets: [ds], activeDatasetId: "ds_1" });

    const { result } = renderHook(() => useActiveDataset());

    expect(result.current.roles.date).toBeNull();
    expect(result.current.roles.measure).toBeNull();
    expect(result.current.roles.category).toBeNull();
  });

  // ── Reactivity: hook updates when store changes ───────────────────────────

  it("updates the returned context when the store changes", () => {
    const { result, rerender } = renderHook(() => useActiveDataset());

    expect(result.current.datasetId).toBeNull();

    // Add a dataset and set it active
    const ds = makeDataset({ id: "ds_new", name: "New Dataset" });
    useDataStore.setState({ datasets: [ds], activeDatasetId: "ds_new" });

    rerender();

    expect(result.current.datasetId).toBe("ds_new");
    expect(result.current.name).toBe("New Dataset");
  });

  // ── View resolution: viewName preferred over tableName ───────────────────

  it("uses viewName when both viewName and tableName are set", () => {
    const ds = makeDataset({ id: "ds_1", viewName: "preferred_view", tableName: "fallback" });
    useDataStore.setState({ datasets: [ds], activeDatasetId: "ds_1" });

    const { result } = renderHook(() => useActiveDataset());

    expect(result.current.view).toBe("preferred_view");
  });

  it("returns view=null when dataset is undefined (empty store)", () => {
    useDataStore.setState({ datasets: [], activeDatasetId: "ds_missing" });

    const { result } = renderHook(() => useActiveDataset());

    // datasets.find() → undefined; datasets[0] → undefined; view = null
    expect(result.current.view).toBeNull();
    expect(result.current.ready).toBe(false);
  });

  it("returns rowCount=0 when dataset is undefined", () => {
    useDataStore.setState({ datasets: [], activeDatasetId: null });

    const { result } = renderHook(() => useActiveDataset());

    expect(result.current.rowCount).toBe(0);
  });

  it("returns datasetId=null when dataset is undefined", () => {
    useDataStore.setState({ datasets: [], activeDatasetId: "nonexistent" });

    const { result } = renderHook(() => useActiveDataset());

    expect(result.current.datasetId).toBeNull();
  });

  it("returns name=null when dataset is undefined", () => {
    useDataStore.setState({ datasets: [], activeDatasetId: null });

    const { result } = renderHook(() => useActiveDataset());

    expect(result.current.name).toBeNull();
  });

  // ── Memoization: same reference when deps unchanged ───────────────────────

  it("returns the same object reference across re-renders when datasets/activeDatasetId are unchanged", () => {
    const ds = makeDataset({ id: "ds_1" });
    useDataStore.setState({ datasets: [ds], activeDatasetId: "ds_1" });

    const { result, rerender } = renderHook(() => useActiveDataset());
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });

  it("returns a new object reference when activeDatasetId changes", () => {
    const ds1 = makeDataset({ id: "ds_a" });
    const ds2 = makeDataset({ id: "ds_b" });
    useDataStore.setState({ datasets: [ds1, ds2], activeDatasetId: "ds_a" });

    const { result, rerender } = renderHook(() => useActiveDataset());
    const first = result.current;

    useDataStore.setState({ activeDatasetId: "ds_b" });
    rerender();

    expect(result.current).not.toBe(first);
    expect(result.current.datasetId).toBe("ds_b");
  });

  // ── Only tableName set (no viewName) ─────────────────────────────────────

  it("uses tableName as view when viewName is not set (empty string)", () => {
    // viewName='' forces the || to go to tableName
    const ds = makeDataset({ id: "ds_1", viewName: "", tableName: "tbl_only" });
    useDataStore.setState({ datasets: [ds], activeDatasetId: "ds_1" });

    const { result } = renderHook(() => useActiveDataset());

    expect(result.current.view).toBe("tbl_only");
    expect(result.current.ready).toBe(true);
  });

  // ── Both viewName and tableName empty: ready=false ────────────────────────

  it("marks ready=false when the resolved view is null", () => {
    const ds = makeDataset({ id: "ds_1", viewName: "", tableName: "" });
    useDataStore.setState({ datasets: [ds], activeDatasetId: "ds_1" });

    const { result } = renderHook(() => useActiveDataset());

    expect(result.current.ready).toBe(false);
  });
});
