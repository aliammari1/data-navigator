/**
 * Tests for src/features/report-studio/hooks/use-report-data.ts
 *
 * Target: 100% line/branch/function coverage.
 *
 * Strategy:
 *  - Mock all external IO: DuckDB queries, insights enrichment, platform/viz.
 *  - Keep the target module logic REAL: toRegistered(), useReportData().
 *  - Drive every branch in toRegistered and every branch in the useQuery fn.
 *  - Use @tanstack/react-query QueryClientProvider for query context.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ─── Boundary mocks ───────────────────────────────────────────────────────────
// Mock aggregateReportData and detectColumnRoles from the queries module.
const aggregateReportDataMock = vi.fn();
const detectColumnRolesMock = vi.fn();

vi.mock("@/features/report-studio/data/queries", () => ({
  aggregateReportData: (...args: unknown[]) => aggregateReportDataMock(...args),
  detectColumnRoles: (...args: unknown[]) => detectColumnRolesMock(...args),
}));

// Mock enrichWithInsights from the insights module.
const enrichWithInsightsMock = vi.fn();

vi.mock("@/features/report-studio/lib/insights", () => ({
  enrichWithInsights: (...args: unknown[]) => enrichWithInsightsMock(...args),
}));

// Mock buildSampleData from the sample-data module.
const buildSampleDataMock = vi.fn();

vi.mock("@/features/report-studio/lib/sample-data", () => ({
  buildSampleData: (date: string) => buildSampleDataMock(date),
}));

// Mock the data-store — we control what datasets/activeDatasetId the hook sees.
let storeState: { datasets: unknown[]; activeDatasetId: string | null } = {
  datasets: [],
  activeDatasetId: null,
};

vi.mock("@/core/stores/data-store", () => ({
  useDataStore: (selector: (s: typeof storeState) => unknown) => selector(storeState),
}));

// ─── Import AFTER mocks ───────────────────────────────────────────────────────
import { useReportData } from "@/features/report-studio/hooks/use-report-data";
import type { Dataset } from "@/core/stores/data-store";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeDataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    id: "ds_test",
    name: "Test Dataset",
    tableName: "test_view",
    viewName: "test_view",
    sourcePath: "/path/to/source.csv",
    cachePath: "/path/to/cache.parquet",
    source: "upload",
    format: "csv",
    rowCount: 1000,
    colCount: 5,
    sizeBytes: 1024,
    columns: [
      { name: "channel", type: "string", nullCount: 0, distinctCount: 10, sample: [] },
      { name: "amount", type: "number", nullCount: 5, distinctCount: 100, sample: [] },
      { name: "status", type: "string", nullCount: 0, distinctCount: 3, sample: [] },
      { name: "timestamp", type: "date", nullCount: 0, distinctCount: 1000, sample: [] },
      { name: "flag", type: "boolean", nullCount: 0, distinctCount: 2, sample: [] },
    ],
    tags: [],
    description: "",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
    qualityScore: 90,
    ...overrides,
  };
}

const SAMPLE_REPORT = {
  date: "2026-06-25",
  totalTransactions: 142847,
  successRate: 96.4,
  totalRevenue: 2845912.75,
  failedTransactions: 5124,
  topChannels: [],
  hourlyData: [],
};

const ENRICHED_REPORT = {
  ...SAMPLE_REPORT,
  anomalies: [],
  comparison: undefined,
};

// ─── QueryClient factory ──────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
      },
    },
  });
}

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  storeState = { datasets: [], activeDatasetId: null };

  // Default: buildSampleData returns a sample report.
  buildSampleDataMock.mockReturnValue(SAMPLE_REPORT);

  // Default: detectColumnRoles returns a timestamp column.
  detectColumnRolesMock.mockReturnValue({
    channel: "channel",
    amount: "amount",
    status: "status",
    timestamp: "timestamp",
  });

  // Default: aggregateReportData returns a report with some transactions.
  aggregateReportDataMock.mockResolvedValue({
    ...SAMPLE_REPORT,
    totalTransactions: 500,
  });

  // Default: enrichWithInsights returns the enriched report.
  enrichWithInsightsMock.mockResolvedValue(ENRICHED_REPORT);

  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Demo fallback (no dataset) ───────────────────────────────────────────────

describe("useReportData — no dataset (demo fallback)", () => {
  it("returns demo data and isDemo=true when no datasets are registered", async () => {
    storeState = { datasets: [], activeDatasetId: null };
    const client = makeQueryClient();

    const { result } = renderHook(() => useReportData("2026-06-25"), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isDemo).toBe(true);
    expect(result.current.data).toBe(SAMPLE_REPORT);
    expect(result.current.datasetName).toBeNull();
    expect(result.current.isError).toBe(false);
    expect(buildSampleDataMock).toHaveBeenCalledWith("2026-06-25");
    // aggregateReportData should NOT be called with no registered dataset.
    expect(aggregateReportDataMock).not.toHaveBeenCalled();
  });

  it("uses the fallback from buildSampleData when query has no data yet", () => {
    storeState = { datasets: [], activeDatasetId: null };
    const client = makeQueryClient();

    const { result } = renderHook(() => useReportData("2026-06-25"), {
      wrapper: makeWrapper(client),
    });

    // Before the query settles, fallback is the sample data.
    expect(result.current.data).toBe(SAMPLE_REPORT);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isDemo).toBe(true); // query.data is undefined so ?? true
  });
});

// ─── Active dataset by ID ─────────────────────────────────────────────────────

describe("useReportData — dataset resolution", () => {
  it("resolves the active dataset by activeDatasetId", async () => {
    const ds1 = makeDataset({ id: "ds_1", name: "Dataset One" });
    const ds2 = makeDataset({ id: "ds_2", name: "Dataset Two" });
    storeState = { datasets: [ds1, ds2], activeDatasetId: "ds_2" };

    const client = makeQueryClient();
    const { result } = renderHook(() => useReportData("2026-06-25"), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.datasetName).toBe("Dataset Two");
    expect(result.current.isDemo).toBe(false);
  });

  it("falls back to datasets[0] when activeDatasetId does not match", async () => {
    const ds1 = makeDataset({ id: "ds_1", name: "First Dataset" });
    const ds2 = makeDataset({ id: "ds_2", name: "Second Dataset" });
    storeState = { datasets: [ds1, ds2], activeDatasetId: "ds_nonexistent" };

    const client = makeQueryClient();
    const { result } = renderHook(() => useReportData("2026-06-25"), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // activeDatasetId doesn't match any — falls back to datasets[0].
    expect(result.current.datasetName).toBe("First Dataset");
  });

  it("returns null datasetName when there are no datasets", async () => {
    storeState = { datasets: [], activeDatasetId: null };

    const client = makeQueryClient();
    const { result } = renderHook(() => useReportData("2026-06-25"), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.datasetName).toBeNull();
  });

  it("uses datasets[0] when activeDatasetId is null but datasets exist", async () => {
    const ds = makeDataset({ id: "ds_only", name: "Only Dataset" });
    storeState = { datasets: [ds], activeDatasetId: null };

    const client = makeQueryClient();
    const { result } = renderHook(() => useReportData("2026-06-25"), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.datasetName).toBe("Only Dataset");
  });
});

// ─── toRegistered: viewName/tableName/id fallback ─────────────────────────────

describe("useReportData — toRegistered viewName resolution", () => {
  it("uses viewName when present", async () => {
    const ds = makeDataset({
      id: "ds_1",
      viewName: "my_view",
      tableName: "my_table",
      columns: [{ name: "channel", type: "string", nullCount: 0, distinctCount: 5, sample: [] }],
    });
    storeState = { datasets: [ds], activeDatasetId: "ds_1" };

    const client = makeQueryClient();
    const { result } = renderHook(() => useReportData("2026-06-25"), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // detectColumnRoles was called — the first arg is the registered dataset
    expect(detectColumnRolesMock).toHaveBeenCalled();
    const registeredArg = detectColumnRolesMock.mock.calls[0][0];
    expect(registeredArg.viewName).toBe("my_view");
  });

  it("falls back to tableName when viewName is empty string", async () => {
    const ds = makeDataset({
      id: "ds_1",
      viewName: "",
      tableName: "fallback_table",
      columns: [{ name: "channel", type: "string", nullCount: 0, distinctCount: 5, sample: [] }],
    });
    storeState = { datasets: [ds], activeDatasetId: "ds_1" };

    const client = makeQueryClient();
    const { result } = renderHook(() => useReportData("2026-06-25"), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const registeredArg = detectColumnRolesMock.mock.calls[0][0];
    expect(registeredArg.viewName).toBe("fallback_table");
  });

  it("falls back to dataset id when both viewName and tableName are empty", async () => {
    const ds = makeDataset({
      id: "ds_fallback_id",
      viewName: "",
      tableName: "",
      columns: [{ name: "channel", type: "string", nullCount: 0, distinctCount: 5, sample: [] }],
    });
    storeState = { datasets: [ds], activeDatasetId: "ds_fallback_id" };

    const client = makeQueryClient();
    const { result } = renderHook(() => useReportData("2026-06-25"), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const registeredArg = detectColumnRolesMock.mock.calls[0][0];
    expect(registeredArg.viewName).toBe("ds_fallback_id");
  });
});

// ─── toRegistered: sourcePath/cachePath/format ───────────────────────────────

describe("useReportData — toRegistered optional fields", () => {
  it("defaults sourcePath to empty string when undefined", async () => {
    const ds = makeDataset({ id: "ds_1", sourcePath: undefined });
    storeState = { datasets: [ds], activeDatasetId: "ds_1" };

    const client = makeQueryClient();
    const { result } = renderHook(() => useReportData("2026-06-25"), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const registeredArg = detectColumnRolesMock.mock.calls[0][0];
    expect(registeredArg.sourcePath).toBe("");
  });

  it("defaults cachePath to empty string when undefined", async () => {
    const ds = makeDataset({ id: "ds_1", cachePath: undefined });
    storeState = { datasets: [ds], activeDatasetId: "ds_1" };

    const client = makeQueryClient();
    const { result } = renderHook(() => useReportData("2026-06-25"), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const registeredArg = detectColumnRolesMock.mock.calls[0][0];
    expect(registeredArg.cachePath).toBe("");
  });

  it("maps format=parquet to sourceFormat=parquet", async () => {
    const ds = makeDataset({ id: "ds_1", format: "parquet" });
    storeState = { datasets: [ds], activeDatasetId: "ds_1" };

    const client = makeQueryClient();
    const { result } = renderHook(() => useReportData("2026-06-25"), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const registeredArg = detectColumnRolesMock.mock.calls[0][0];
    expect(registeredArg.sourceFormat).toBe("parquet");
  });

  it("maps non-parquet format to sourceFormat=csv", async () => {
    const ds = makeDataset({ id: "ds_1", format: "csv" });
    storeState = { datasets: [ds], activeDatasetId: "ds_1" };

    const client = makeQueryClient();
    const { result } = renderHook(() => useReportData("2026-06-25"), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const registeredArg = detectColumnRolesMock.mock.calls[0][0];
    expect(registeredArg.sourceFormat).toBe("csv");
  });
});

// ─── toRegistered: column SQL_TYPE mapping ───────────────────────────────────

describe("useReportData — toRegistered column type mapping", () => {
  it("maps all known ColTypes to SQL types correctly", async () => {
    const ds = makeDataset({
      id: "ds_1",
      columns: [
        { name: "num_col", type: "number", nullCount: 0, distinctCount: 10, sample: [] },
        { name: "str_col", type: "string", nullCount: 1, distinctCount: 5, sample: [] },
        { name: "date_col", type: "date", nullCount: 0, distinctCount: 100, sample: [] },
        { name: "bool_col", type: "boolean", nullCount: 0, distinctCount: 2, sample: [] },
        { name: "unk_col", type: "unknown", nullCount: 2, distinctCount: 1, sample: [] },
      ],
    });
    storeState = { datasets: [ds], activeDatasetId: "ds_1" };

    const client = makeQueryClient();
    const { result } = renderHook(() => useReportData("2026-06-25"), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const registeredArg = detectColumnRolesMock.mock.calls[0][0];
    const cols: Array<{ name: string; type: string; nullable: boolean }> = registeredArg.columns;

    expect(cols.find((c) => c.name === "num_col")?.type).toBe("DOUBLE");
    expect(cols.find((c) => c.name === "str_col")?.type).toBe("VARCHAR");
    expect(cols.find((c) => c.name === "date_col")?.type).toBe("TIMESTAMP");
    expect(cols.find((c) => c.name === "bool_col")?.type).toBe("BOOLEAN");
    expect(cols.find((c) => c.name === "unk_col")?.type).toBe("VARCHAR");
  });

  it("maps nullable correctly based on nullCount > 0", async () => {
    const ds = makeDataset({
      id: "ds_1",
      columns: [
        { name: "no_nulls", type: "string", nullCount: 0, distinctCount: 5, sample: [] },
        { name: "has_nulls", type: "string", nullCount: 3, distinctCount: 5, sample: [] },
      ],
    });
    storeState = { datasets: [ds], activeDatasetId: "ds_1" };

    const client = makeQueryClient();
    const { result } = renderHook(() => useReportData("2026-06-25"), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const registeredArg = detectColumnRolesMock.mock.calls[0][0];
    const cols: Array<{ name: string; type: string; nullable: boolean }> = registeredArg.columns;

    expect(cols.find((c) => c.name === "no_nulls")?.nullable).toBe(false);
    expect(cols.find((c) => c.name === "has_nulls")?.nullable).toBe(true);
  });

  it("falls back to VARCHAR for an unrecognized column type", async () => {
    const ds = makeDataset({
      id: "ds_1",
      columns: [
        {
          name: "weird_col",
          type: "unrecognized_type" as "unknown",
          nullCount: 0,
          distinctCount: 5,
          sample: [],
        },
      ],
    });
    storeState = { datasets: [ds], activeDatasetId: "ds_1" };

    const client = makeQueryClient();
    const { result } = renderHook(() => useReportData("2026-06-25"), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const registeredArg = detectColumnRolesMock.mock.calls[0][0];
    const cols: Array<{ name: string; type: string; nullable: boolean }> = registeredArg.columns;

    expect(cols[0].type).toBe("VARCHAR");
  });
});

// ─── scopeToDay branch: timestamp present ─────────────────────────────────────

describe("useReportData — scopeToDay=true (timestamp column detected)", () => {
  it("calls aggregateReportData with scopeToDay=true when timestamp exists and returns enriched data", async () => {
    detectColumnRolesMock.mockReturnValue({
      channel: "channel",
      amount: "amount",
      status: "status",
      timestamp: "timestamp", // has a timestamp column
    });

    const aggregatedData = {
      ...SAMPLE_REPORT,
      totalTransactions: 300, // non-zero
    };
    aggregateReportDataMock.mockResolvedValue(aggregatedData);
    enrichWithInsightsMock.mockResolvedValue(ENRICHED_REPORT);

    const ds = makeDataset({ id: "ds_1" });
    storeState = { datasets: [ds], activeDatasetId: "ds_1" };

    const client = makeQueryClient();
    const { result } = renderHook(() => useReportData("2026-06-25"), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // First call: scopeToDay=true
    expect(aggregateReportDataMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ds_1" }),
      "2026-06-25",
      { scopeToDay: true },
    );
    expect(result.current.isDemo).toBe(false);
    expect(result.current.data).toBe(ENRICHED_REPORT);
    expect(enrichWithInsightsMock).toHaveBeenCalledWith(
      aggregatedData,
      expect.objectContaining({ id: "ds_1" }),
    );
  });

  it("calls aggregateReportData a second time (without scopeToDay) when totalTransactions is 0", async () => {
    detectColumnRolesMock.mockReturnValue({
      channel: "channel",
      amount: "amount",
      status: "status",
      timestamp: "timestamp",
    });

    const zeroData = { ...SAMPLE_REPORT, totalTransactions: 0 };
    const fullData = { ...SAMPLE_REPORT, totalTransactions: 999 };

    aggregateReportDataMock
      .mockResolvedValueOnce(zeroData)   // first call: scopeToDay=true → 0 transactions
      .mockResolvedValueOnce(fullData);  // second call: no scopeToDay → full view

    enrichWithInsightsMock.mockResolvedValue(ENRICHED_REPORT);

    const ds = makeDataset({ id: "ds_1" });
    storeState = { datasets: [ds], activeDatasetId: "ds_1" };

    const client = makeQueryClient();
    const { result } = renderHook(() => useReportData("2026-06-25"), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // First call: scopeToDay=true
    expect(aggregateReportDataMock).toHaveBeenNthCalledWith(
      1,
      expect.any(Object),
      "2026-06-25",
      { scopeToDay: true },
    );
    // Second call: no scopeToDay (fallback to whole-view)
    expect(aggregateReportDataMock).toHaveBeenNthCalledWith(
      2,
      expect.any(Object),
      "2026-06-25",
    );
    // enrichWithInsights gets the fallback fullData
    expect(enrichWithInsightsMock).toHaveBeenCalledWith(fullData, expect.any(Object));
  });
});

// ─── scopeToDay branch: no timestamp column ───────────────────────────────────

describe("useReportData — scopeToDay=false (no timestamp column)", () => {
  it("calls aggregateReportData with scopeToDay=false when no timestamp column", async () => {
    detectColumnRolesMock.mockReturnValue({
      channel: "channel",
      amount: "amount",
      status: "status",
      timestamp: null, // no timestamp
    });

    const aggregatedData = { ...SAMPLE_REPORT, totalTransactions: 100 };
    aggregateReportDataMock.mockResolvedValue(aggregatedData);
    enrichWithInsightsMock.mockResolvedValue(ENRICHED_REPORT);

    const ds = makeDataset({ id: "ds_1" });
    storeState = { datasets: [ds], activeDatasetId: "ds_1" };

    const client = makeQueryClient();
    const { result } = renderHook(() => useReportData("2026-06-25"), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // scopeToDay is false because timestamp is null.
    expect(aggregateReportDataMock).toHaveBeenCalledWith(
      expect.any(Object),
      "2026-06-25",
      { scopeToDay: false },
    );
    // No second call since scopeToDay is false.
    expect(aggregateReportDataMock).toHaveBeenCalledTimes(1);
    // enrichWithInsights still gets called.
    expect(enrichWithInsightsMock).toHaveBeenCalledWith(aggregatedData, expect.any(Object));
    expect(result.current.isDemo).toBe(false);
  });
});

// ─── Return shape ─────────────────────────────────────────────────────────────

describe("useReportData — return shape", () => {
  it("exposes all required fields on the result object", async () => {
    storeState = { datasets: [], activeDatasetId: null };
    const client = makeQueryClient();

    const { result } = renderHook(() => useReportData("2026-06-25"), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(typeof result.current.data).toBe("object");
    expect(typeof result.current.isLoading).toBe("boolean");
    expect(typeof result.current.isError).toBe("boolean");
    expect(typeof result.current.isDemo).toBe("boolean");
    expect(typeof result.current.refetch).toBe("function");
    // datasetName is null (no datasets)
    expect(result.current.datasetName).toBeNull();
  });

  it("uses query.data.data when query has resolved", async () => {
    const ds = makeDataset({ id: "ds_1" });
    storeState = { datasets: [ds], activeDatasetId: "ds_1" };
    enrichWithInsightsMock.mockResolvedValue(ENRICHED_REPORT);

    const client = makeQueryClient();
    const { result } = renderHook(() => useReportData("2026-06-25"), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // data comes from the query result, not the fallback.
    expect(result.current.data).toBe(ENRICHED_REPORT);
  });
});

// ─── Query key changes ────────────────────────────────────────────────────────

describe("useReportData — query key includes date", () => {
  it("fetches new data when the date prop changes", async () => {
    const ds = makeDataset({ id: "ds_1" });
    storeState = { datasets: [ds], activeDatasetId: "ds_1" };

    const enrichedA = { ...ENRICHED_REPORT, date: "2026-06-24" };
    const enrichedB = { ...ENRICHED_REPORT, date: "2026-06-25" };

    enrichWithInsightsMock
      .mockResolvedValueOnce(enrichedA)
      .mockResolvedValueOnce(enrichedB);

    const client = makeQueryClient();
    let date = "2026-06-24";

    const { result, rerender } = renderHook(() => useReportData(date), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data.date).toBe("2026-06-24");

    date = "2026-06-25";
    rerender();

    await waitFor(() => {
      expect(result.current.data.date).toBe("2026-06-25");
    });
  });
});

// ─── isError state ────────────────────────────────────────────────────────────

describe("useReportData — error state", () => {
  it("sets isError=true when aggregateReportData throws", async () => {
    const ds = makeDataset({ id: "ds_1" });
    storeState = { datasets: [ds], activeDatasetId: "ds_1" };

    aggregateReportDataMock.mockRejectedValue(new Error("DuckDB failure"));

    const client = makeQueryClient();
    const { result } = renderHook(() => useReportData("2026-06-25"), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.isLoading).toBe(false);
    // Falls back to sample data on error.
    expect(result.current.data).toBe(SAMPLE_REPORT);
    // isDemo falls back to true since query.data is undefined.
    expect(result.current.isDemo).toBe(true);
  });

  it("sets isError=true when enrichWithInsights throws", async () => {
    const ds = makeDataset({ id: "ds_1" });
    storeState = { datasets: [ds], activeDatasetId: "ds_1" };

    aggregateReportDataMock.mockResolvedValue({ ...SAMPLE_REPORT, totalTransactions: 100 });
    enrichWithInsightsMock.mockRejectedValue(new Error("insights failure"));

    const client = makeQueryClient();
    const { result } = renderHook(() => useReportData("2026-06-25"), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.data).toBe(SAMPLE_REPORT);
    expect(result.current.isDemo).toBe(true);
  });
});

// ─── refetch function ─────────────────────────────────────────────────────────

describe("useReportData — refetch", () => {
  it("exposes a refetch function that can be called", async () => {
    storeState = { datasets: [], activeDatasetId: null };
    const client = makeQueryClient();

    const { result } = renderHook(() => useReportData("2026-06-25"), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(typeof result.current.refetch).toBe("function");
    // Should not throw when called.
    await expect(result.current.refetch()).resolves.toBeDefined();
  });
});

// ─── Demo isDemo=true path in query ──────────────────────────────────────────

describe("useReportData — isDemo from query result", () => {
  it("isDemo=false when query resolves with isDemo=false (real dataset)", async () => {
    const ds = makeDataset({ id: "ds_1", name: "Real Data" });
    storeState = { datasets: [ds], activeDatasetId: "ds_1" };
    enrichWithInsightsMock.mockResolvedValue(ENRICHED_REPORT);

    const client = makeQueryClient();
    const { result } = renderHook(() => useReportData("2026-06-25"), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isDemo).toBe(false);
  });

  it("isDemo=true when query resolves with isDemo=true (no registered)", async () => {
    storeState = { datasets: [], activeDatasetId: null };

    const client = makeQueryClient();
    const { result } = renderHook(() => useReportData("2026-06-25"), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isDemo).toBe(true);
  });
});

// ─── fallback used as memo ────────────────────────────────────────────────────

describe("useReportData — fallback useMemo", () => {
  it("creates the fallback only for the given date", () => {
    storeState = { datasets: [], activeDatasetId: null };
    const client = makeQueryClient();

    renderHook(() => useReportData("2026-03-15"), {
      wrapper: makeWrapper(client),
    });

    // buildSampleData called with the date arg for the fallback useMemo.
    // Note: it's also called inside the queryFn for demo path.
    expect(buildSampleDataMock).toHaveBeenCalledWith("2026-03-15");
  });
});
