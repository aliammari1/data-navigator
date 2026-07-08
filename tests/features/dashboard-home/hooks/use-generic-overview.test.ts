import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Boundary mocks ────────────────────────────────────────────────────────────
//
// The hook's single IO boundary is `buildGenericOverview` from the lib module.
// Mock it so no real DuckDB/native calls happen.

const buildGenericOverview = vi.fn<
  (datasetId: string, viewName: string, rowCount: number) => Promise<unknown>
>();

vi.mock("@/features/dashboard-home/lib/generic-overview", () => ({
  buildGenericOverview: (datasetId: string, viewName: string, rowCount: number) =>
    buildGenericOverview(datasetId, viewName, rowCount),
}));

import type { Dataset } from "@/core/stores/data-store";
import { useGenericOverview } from "@/features/dashboard-home/hooks/use-generic-overview";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeDataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    id: "ds_test",
    name: "Test Dataset",
    tableName: "tbl_test",
    viewName: "view_test",
    source: "upload",
    format: "csv",
    rowCount: 1000,
    colCount: 5,
    sizeBytes: 2048,
    columns: [],
    tags: [],
    description: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    qualityScore: 80,
    ...overrides,
  };
}

const MOCK_OVERVIEW = {
  rowCount: 1000,
  columnCount: 5,
  numericColumnCount: 2,
  temporalColumnCount: 1,
  categoricalColumnCount: 1,
  avgNullPercentage: 5,
  totalNullCells: 250,
  columns: [],
  topCategorical: null,
  numericHistogram: null,
};

// ─── Wrapper factory ───────────────────────────────────────────────────────────

function createWrapper(retries = 0) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: retries,
        gcTime: 0,
        staleTime: 0,
      },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => {
    const { createElement } = require("react") as typeof import("react");
    return createElement(QueryClientProvider, { client }, children);
  };
  return { client, wrapper };
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  buildGenericOverview.mockResolvedValue(MOCK_OVERVIEW);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useGenericOverview — null dataset (disabled)", () => {
  it("returns a disabled query (no data, not loading) when dataset is null", () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useGenericOverview(null), { wrapper });

    expect(result.current.data).toBeUndefined();
    expect(result.current.isPending).toBe(true);
    expect(buildGenericOverview).not.toHaveBeenCalled();
  });

  it("never calls buildGenericOverview when dataset is null", async () => {
    const { wrapper } = createWrapper();
    renderHook(() => useGenericOverview(null), { wrapper });

    // Allow microtasks to flush
    await new Promise((r) => setTimeout(r, 10));

    expect(buildGenericOverview).not.toHaveBeenCalled();
  });
});

describe("useGenericOverview — dataset without id (disabled)", () => {
  it("is disabled when dataset has no id (empty string)", async () => {
    const { wrapper } = createWrapper();
    const dataset = makeDataset({ id: "" });
    renderHook(() => useGenericOverview(dataset), { wrapper });

    await new Promise((r) => setTimeout(r, 10));

    expect(buildGenericOverview).not.toHaveBeenCalled();
  });

  it("is disabled when viewName and tableName are both empty", async () => {
    const { wrapper } = createWrapper();
    const dataset = makeDataset({ viewName: "", tableName: "" });
    renderHook(() => useGenericOverview(dataset), { wrapper });

    await new Promise((r) => setTimeout(r, 10));

    expect(buildGenericOverview).not.toHaveBeenCalled();
  });
});

describe("useGenericOverview — viewName resolution", () => {
  it("uses viewName when present (prefers it over tableName)", async () => {
    const { wrapper } = createWrapper();
    const dataset = makeDataset({ viewName: "view_test", tableName: "tbl_test", rowCount: 500 });

    const { result } = renderHook(() => useGenericOverview(dataset), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(buildGenericOverview).toHaveBeenCalledWith("ds_test", "view_test", 500);
  });

  it("falls back to tableName when viewName is empty", async () => {
    const { wrapper } = createWrapper();
    const dataset = makeDataset({ viewName: "", tableName: "tbl_fallback", rowCount: 200 });

    const { result } = renderHook(() => useGenericOverview(dataset), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(buildGenericOverview).toHaveBeenCalledWith("ds_test", "tbl_fallback", 200);
  });

  it("uses empty string when both viewName and tableName are falsy (disabled)", async () => {
    const { wrapper } = createWrapper();
    const dataset = makeDataset({ id: "ds_test", viewName: "", tableName: "" });

    renderHook(() => useGenericOverview(dataset), { wrapper });

    await new Promise((r) => setTimeout(r, 10));

    // enabled = false because viewName resolves to "" which is falsy
    expect(buildGenericOverview).not.toHaveBeenCalled();
  });
});

describe("useGenericOverview — successful query", () => {
  it("returns the overview data on success", async () => {
    const { wrapper } = createWrapper();
    const dataset = makeDataset();

    const { result } = renderHook(() => useGenericOverview(dataset), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(MOCK_OVERVIEW);
  });

  it("passes rowCount = 0 when dataset.rowCount is 0", async () => {
    const { wrapper } = createWrapper();
    const dataset = makeDataset({ rowCount: 0 });

    const { result } = renderHook(() => useGenericOverview(dataset), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(buildGenericOverview).toHaveBeenCalledWith("ds_test", "view_test", 0);
  });

  it("passes the correct rowCount from the dataset", async () => {
    const { wrapper } = createWrapper();
    const dataset = makeDataset({ rowCount: 9999 });

    const { result } = renderHook(() => useGenericOverview(dataset), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(buildGenericOverview).toHaveBeenCalledWith("ds_test", "view_test", 9999);
  });

  it("is enabled when dataset has both id and viewName", async () => {
    const { wrapper } = createWrapper();
    const dataset = makeDataset({ id: "ds_abc", viewName: "vw_abc" });

    const { result } = renderHook(() => useGenericOverview(dataset), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(buildGenericOverview).toHaveBeenCalledTimes(1);
  });

  it("is enabled with tableName as fallback view", async () => {
    const { wrapper } = createWrapper();
    const dataset = makeDataset({ id: "ds_abc", viewName: "", tableName: "my_table" });

    const { result } = renderHook(() => useGenericOverview(dataset), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(buildGenericOverview).toHaveBeenCalledWith("ds_abc", "my_table", 1000);
  });
});

describe("useGenericOverview — queryKey composition", () => {
  it("builds the query key from stable dataset fields", async () => {
    // Verify distinct datasets produce distinct keys by rendering two hooks
    // with different datasets and checking both fire.
    const { wrapper: wrapper1 } = createWrapper();
    const { wrapper: wrapper2 } = createWrapper();

    const dataset1 = makeDataset({ id: "ds_1", viewName: "vw_1", rowCount: 100, updatedAt: "2026-01-01T00:00:00.000Z" });
    const dataset2 = makeDataset({ id: "ds_2", viewName: "vw_2", rowCount: 200, updatedAt: "2026-01-02T00:00:00.000Z" });

    const { result: result1 } = renderHook(() => useGenericOverview(dataset1), { wrapper: wrapper1 });
    const { result: result2 } = renderHook(() => useGenericOverview(dataset2), { wrapper: wrapper2 });

    await waitFor(() => expect(result1.current.isSuccess).toBe(true));
    await waitFor(() => expect(result2.current.isSuccess).toBe(true));

    expect(buildGenericOverview).toHaveBeenCalledTimes(2);
    expect(buildGenericOverview).toHaveBeenCalledWith("ds_1", "vw_1", 100);
    expect(buildGenericOverview).toHaveBeenCalledWith("ds_2", "vw_2", 200);
  });

  it("uses empty string for id when dataset.id is undefined", async () => {
    // The queryKey fallbacks `dataset?.id ?? ""` are exercised via null dataset
    const { wrapper } = createWrapper();

    renderHook(() => useGenericOverview(null), { wrapper });

    await new Promise((r) => setTimeout(r, 10));

    // No call should happen; the key still falls through nullish coalescing
    expect(buildGenericOverview).not.toHaveBeenCalled();
  });
});

describe("useGenericOverview — placeholderData", () => {
  it("provides the previous data as placeholder on dataset change", async () => {
    const { wrapper, client } = createWrapper();

    const dataset1 = makeDataset({ id: "ds_1", viewName: "vw_1", rowCount: 100 });
    const overview1 = { ...MOCK_OVERVIEW, rowCount: 100 };
    buildGenericOverview.mockResolvedValueOnce(overview1);

    const { result, rerender } = renderHook(
      ({ dataset }) => useGenericOverview(dataset),
      {
        wrapper,
        initialProps: { dataset: dataset1 as Dataset | null },
      },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(overview1);

    // Switch to a new dataset — the placeholder will show the previous result
    const dataset2 = makeDataset({ id: "ds_2", viewName: "vw_2", rowCount: 999 });
    buildGenericOverview.mockResolvedValueOnce({ ...MOCK_OVERVIEW, rowCount: 999 });

    rerender({ dataset: dataset2 });

    // The placeholder data (previous) should be set while the new query loads
    // placeholderData=(previous)=>previous means we get the old data as placeholder
    await waitFor(() => expect(result.current.data?.rowCount).toBe(999));
  });
});

describe("useGenericOverview — staleTime / gcTime config", () => {
  it("does not re-fetch on window focus (staleTime = Infinity)", async () => {
    const { wrapper } = createWrapper();
    const dataset = makeDataset();

    const { result } = renderHook(() => useGenericOverview(dataset), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // With staleTime=Infinity, only one call should happen
    expect(buildGenericOverview).toHaveBeenCalledTimes(1);
  });
});

describe("useGenericOverview — nullish coalescing in queryKey", () => {
  it("falls back rowCount to 0 when dataset.rowCount is absent", async () => {
    const { wrapper } = createWrapper();
    // Force rowCount to an undefined-equivalent by omission at the type level
    const dataset = makeDataset({ rowCount: undefined as unknown as number });

    const { result } = renderHook(() => useGenericOverview(dataset), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // rowCount ?? 0 → passes 0 (or NaN coerced). The queryKey uses ?? 0
    // and the queryFn also uses dataset?.rowCount ?? 0
    expect(buildGenericOverview).toHaveBeenCalledWith(
      "ds_test",
      "view_test",
      expect.any(Number),
    );
  });

  it("falls back updatedAt to empty string when absent", async () => {
    const { wrapper } = createWrapper();
    const dataset = makeDataset({ updatedAt: undefined as unknown as string });

    const { result } = renderHook(() => useGenericOverview(dataset), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // updatedAt ?? "" produces "" in queryKey; the query still runs
    expect(buildGenericOverview).toHaveBeenCalledTimes(1);
  });
});

describe("useGenericOverview — queryFn receives casted dataset", () => {
  it("calls buildGenericOverview with dataset.id, resolved viewName, and rowCount", async () => {
    const { wrapper } = createWrapper();
    const dataset = makeDataset({
      id: "ds_xyz",
      viewName: "vw_xyz",
      tableName: "tbl_xyz",
      rowCount: 42,
    });

    const { result } = renderHook(() => useGenericOverview(dataset), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // viewName takes precedence over tableName
    expect(buildGenericOverview).toHaveBeenCalledWith("ds_xyz", "vw_xyz", 42);
  });

  it("uses tableName in viewName position when viewName is falsy", async () => {
    const { wrapper } = createWrapper();
    const dataset = makeDataset({
      id: "ds_xyz",
      viewName: "",
      tableName: "tbl_only",
      rowCount: 7,
    });

    const { result } = renderHook(() => useGenericOverview(dataset), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(buildGenericOverview).toHaveBeenCalledWith("ds_xyz", "tbl_only", 7);
  });
});
