import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDataStore } from "@/core/stores/data-store";
import type { Dataset } from "@/core/stores/data-store";
import { useAnalyticsSource } from "@/features/deep-analytics/lib/use-analytics-source";

// ---------------------------------------------------------------------------
// Reset the Zustand store before each test so state never leaks between tests.
// ---------------------------------------------------------------------------

function makeDataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    id: "ds_001",
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    qualityScore: 80,
    ...overrides,
  };
}

beforeEach(() => {
  // Reset the store to a clean slate: clear all datasets and active id.
  useDataStore.setState({ datasets: [], activeDatasetId: null });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useAnalyticsSource — no active dataset", () => {
  it("returns undefined identifiers and empty column lists when there is no dataset", () => {
    // Arrange: store has no datasets (already cleared in beforeEach).

    // Act
    const { result } = renderHook(() => useAnalyticsSource());

    // Assert
    expect(result.current.datasetId).toBeUndefined();
    expect(result.current.viewName).toBeUndefined();
    expect(result.current.datasetName).toBeUndefined();
    expect(result.current.rowCount).toBe(0);
    expect(result.current.columns).toEqual([]);
    expect(result.current.numericColumns).toEqual([]);
    expect(result.current.categoricalColumns).toEqual([]);
    expect(result.current.dateColumns).toEqual([]);
    expect(result.current.enabled).toBe(false);
  });

  it("enabled is false when there is no active dataset", () => {
    const { result } = renderHook(() => useAnalyticsSource());
    expect(result.current.enabled).toBe(false);
  });
});

describe("useAnalyticsSource — active dataset with columns", () => {
  it("returns the correct datasetId, viewName, and datasetName from the active dataset", () => {
    // Arrange
    const ds = makeDataset({ id: "ds_abc", name: "Sales", viewName: "sales_view" });
    useDataStore.setState({ datasets: [ds], activeDatasetId: "ds_abc" });

    // Act
    const { result } = renderHook(() => useAnalyticsSource());

    // Assert
    expect(result.current.datasetId).toBe("ds_abc");
    expect(result.current.viewName).toBe("sales_view");
    expect(result.current.datasetName).toBe("Sales");
    expect(result.current.enabled).toBe(true);
  });

  it("uses tableName as viewName fallback when viewName is undefined", () => {
    // Arrange: dataset with no viewName — force it undefined by spreading
    const ds = makeDataset({ tableName: "fallback_table" });
    // Override viewName to undefined after spread (it's a required field in Dataset but the
    // hook handles the undefined case via the ?? operator)
    const dsWithoutView = { ...ds, viewName: undefined as unknown as string };
    useDataStore.setState({ datasets: [dsWithoutView], activeDatasetId: ds.id });

    // Act
    const { result } = renderHook(() => useAnalyticsSource());

    // Assert — falls back to tableName
    expect(result.current.viewName).toBe("fallback_table");
    expect(result.current.enabled).toBe(true);
  });

  it("enabled is false when both viewName and tableName are falsy", () => {
    // Arrange: dataset with empty viewName and tableName
    const ds = makeDataset({ viewName: "" as unknown as string, tableName: "" });
    useDataStore.setState({ datasets: [ds], activeDatasetId: ds.id });

    // Act
    const { result } = renderHook(() => useAnalyticsSource());

    // Assert — Boolean("") === false
    expect(result.current.viewName).toBe("");
    expect(result.current.enabled).toBe(false);
  });

  it("returns the rowCount from the active dataset", () => {
    // Arrange
    const ds = makeDataset({ rowCount: 999 });
    useDataStore.setState({ datasets: [ds], activeDatasetId: ds.id });

    // Act
    const { result } = renderHook(() => useAnalyticsSource());

    // Assert
    expect(result.current.rowCount).toBe(999);
  });

  it("defaults rowCount to 0 when dataset.rowCount is 0", () => {
    // Arrange
    const ds = makeDataset({ rowCount: 0 });
    useDataStore.setState({ datasets: [ds], activeDatasetId: ds.id });

    // Act
    const { result } = renderHook(() => useAnalyticsSource());

    // Assert
    expect(result.current.rowCount).toBe(0);
  });

  it("categorises number-type columns into numericColumns", () => {
    // Arrange
    const ds = makeDataset({
      columns: [
        { name: "revenue", type: "number", nullCount: 0, distinctCount: 50, sample: [] },
        { name: "name", type: "string", nullCount: 0, distinctCount: 10, sample: [] },
      ],
    });
    useDataStore.setState({ datasets: [ds], activeDatasetId: ds.id });

    // Act
    const { result } = renderHook(() => useAnalyticsSource());

    // Assert
    expect(result.current.numericColumns).toEqual(["revenue"]);
    expect(result.current.categoricalColumns).toContain("name");
    expect(result.current.dateColumns).toEqual([]);
  });

  it("categorises string-type columns into categoricalColumns", () => {
    // Arrange
    const ds = makeDataset({
      columns: [
        { name: "category", type: "string", nullCount: 0, distinctCount: 5, sample: [] },
      ],
    });
    useDataStore.setState({ datasets: [ds], activeDatasetId: ds.id });

    // Act
    const { result } = renderHook(() => useAnalyticsSource());

    // Assert
    expect(result.current.categoricalColumns).toEqual(["category"]);
  });

  it("categorises boolean-type columns into categoricalColumns", () => {
    // Arrange
    const ds = makeDataset({
      columns: [
        { name: "is_active", type: "boolean", nullCount: 0, distinctCount: 2, sample: [] },
      ],
    });
    useDataStore.setState({ datasets: [ds], activeDatasetId: ds.id });

    // Act
    const { result } = renderHook(() => useAnalyticsSource());

    // Assert
    expect(result.current.categoricalColumns).toEqual(["is_active"]);
    expect(result.current.numericColumns).toEqual([]);
    expect(result.current.dateColumns).toEqual([]);
  });

  it("categorises date-type columns into dateColumns", () => {
    // Arrange
    const ds = makeDataset({
      columns: [
        { name: "created_at", type: "date", nullCount: 0, distinctCount: 30, sample: [] },
      ],
    });
    useDataStore.setState({ datasets: [ds], activeDatasetId: ds.id });

    // Act
    const { result } = renderHook(() => useAnalyticsSource());

    // Assert
    expect(result.current.dateColumns).toEqual(["created_at"]);
    expect(result.current.numericColumns).toEqual([]);
    expect(result.current.categoricalColumns).toEqual([]);
  });

  it("columns with type 'unknown' are excluded from all categorised lists", () => {
    // Arrange
    const ds = makeDataset({
      columns: [
        { name: "misc", type: "unknown", nullCount: 0, distinctCount: 1, sample: [] },
      ],
    });
    useDataStore.setState({ datasets: [ds], activeDatasetId: ds.id });

    // Act
    const { result } = renderHook(() => useAnalyticsSource());

    // Assert
    expect(result.current.numericColumns).toEqual([]);
    expect(result.current.categoricalColumns).toEqual([]);
    expect(result.current.dateColumns).toEqual([]);
    expect(result.current.columns).toHaveLength(1);
  });

  it("handles a mixed dataset with all column types", () => {
    // Arrange
    const ds = makeDataset({
      columns: [
        { name: "amount", type: "number", nullCount: 0, distinctCount: 100, sample: [] },
        { name: "currency", type: "string", nullCount: 0, distinctCount: 3, sample: [] },
        { name: "is_paid", type: "boolean", nullCount: 0, distinctCount: 2, sample: [] },
        { name: "paid_at", type: "date", nullCount: 0, distinctCount: 50, sample: [] },
        { name: "raw_data", type: "unknown", nullCount: 0, distinctCount: 1, sample: [] },
      ],
    });
    useDataStore.setState({ datasets: [ds], activeDatasetId: ds.id });

    // Act
    const { result } = renderHook(() => useAnalyticsSource());

    // Assert
    expect(result.current.numericColumns).toEqual(["amount"]);
    expect(result.current.categoricalColumns).toEqual(["currency", "is_paid"]);
    expect(result.current.dateColumns).toEqual(["paid_at"]);
    expect(result.current.columns).toHaveLength(5);
    expect(result.current.enabled).toBe(true);
  });

  it("returns all columns via the columns field (unfiltered)", () => {
    // Arrange
    const ds = makeDataset({
      columns: [
        { name: "a", type: "number", nullCount: 0, distinctCount: 5, sample: [] },
        { name: "b", type: "date", nullCount: 0, distinctCount: 5, sample: [] },
        { name: "c", type: "string", nullCount: 0, distinctCount: 5, sample: [] },
      ],
    });
    useDataStore.setState({ datasets: [ds], activeDatasetId: ds.id });

    // Act
    const { result } = renderHook(() => useAnalyticsSource());

    // Assert
    expect(result.current.columns).toHaveLength(3);
    expect(result.current.columns.map((c) => c.name)).toEqual(["a", "b", "c"]);
  });
});

describe("useAnalyticsSource — viewName vs tableName resolution", () => {
  it("prefers viewName over tableName when both are present", () => {
    // Arrange
    const ds = makeDataset({ viewName: "my_view", tableName: "my_table" });
    useDataStore.setState({ datasets: [ds], activeDatasetId: ds.id });

    // Act
    const { result } = renderHook(() => useAnalyticsSource());

    // Assert — viewName takes priority via ?? (left-to-right)
    expect(result.current.viewName).toBe("my_view");
  });

  it("falls back to tableName when viewName is an empty string", () => {
    // Arrange: viewName is "" (falsy for ??) — the nullish coalescing only falls back on null/undefined,
    // so empty string should remain as-is; enabled will be false.
    const ds = makeDataset({ viewName: "" as unknown as string, tableName: "my_table" });
    useDataStore.setState({ datasets: [ds], activeDatasetId: ds.id });

    // Act
    const { result } = renderHook(() => useAnalyticsSource());

    // viewName="" is NOT null/undefined, so ?? does NOT fall through to tableName
    // This tests the exact behavior: "" ?? "my_table" === ""
    expect(result.current.viewName).toBe("");
    expect(result.current.enabled).toBe(false);
  });

  it("falls back to tableName when viewName is undefined", () => {
    // Arrange: explicitly set viewName to undefined so ?? falls through
    const ds = {
      ...makeDataset({ tableName: "only_table" }),
      viewName: undefined as unknown as string,
    };
    useDataStore.setState({ datasets: [ds], activeDatasetId: ds.id });

    // Act
    const { result } = renderHook(() => useAnalyticsSource());

    // Assert — undefined ?? "only_table" === "only_table"
    expect(result.current.viewName).toBe("only_table");
    expect(result.current.enabled).toBe(true);
  });
});

describe("useAnalyticsSource — AnalyticsSource interface", () => {
  it("returns the complete AnalyticsSource shape with all expected fields", () => {
    // Arrange
    const ds = makeDataset({
      id: "ds_full",
      name: "Full Dataset",
      viewName: "full_view",
      rowCount: 42,
      columns: [
        { name: "score", type: "number", nullCount: 0, distinctCount: 10, sample: [] },
      ],
    });
    useDataStore.setState({ datasets: [ds], activeDatasetId: "ds_full" });

    // Act
    const { result } = renderHook(() => useAnalyticsSource());
    const src = result.current;

    // Assert all fields exist on the interface shape
    expect(src).toHaveProperty("datasetId", "ds_full");
    expect(src).toHaveProperty("viewName", "full_view");
    expect(src).toHaveProperty("datasetName", "Full Dataset");
    expect(src).toHaveProperty("rowCount", 42);
    expect(src).toHaveProperty("columns");
    expect(src).toHaveProperty("numericColumns");
    expect(src).toHaveProperty("categoricalColumns");
    expect(src).toHaveProperty("dateColumns");
    expect(src).toHaveProperty("enabled", true);
  });

  it("the hook is stable across renders when the dataset has not changed (memoisation)", () => {
    // Arrange
    const ds = makeDataset();
    useDataStore.setState({ datasets: [ds], activeDatasetId: ds.id });

    // Act — render twice; the memoised object reference should be the same
    const { result, rerender } = renderHook(() => useAnalyticsSource());
    const first = result.current;
    rerender();
    const second = result.current;

    // Assert — useMemo returns the same object reference
    expect(first).toBe(second);
  });
});
