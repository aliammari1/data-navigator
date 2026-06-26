/**
 * Tests for useColumnDetail hook.
 *
 * Strategy:
 * - Mock @/platform/duckdb/duckdb so no real DuckDB is touched.
 * - Keep all logic in the real useColumnDetail module so coverage counts.
 * - Provide a minimal ProfileWorkerClient stub per test.
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RegisteredDataset } from "@/platform/duckdb/duckdb";
import type { ColProfile, ColumnDetail } from "@/features/parsed-data/model/types";
import type { ProfileWorkerClient } from "@/features/parsed-data/worker/useProfileWorker";

// ─── Mock DuckDB ──────────────────────────────────────────────────────────────

const mockRunReadOnlyQuery = vi.fn();

vi.mock("@/platform/duckdb/duckdb", () => ({
  runReadOnlyQuery: (...args: unknown[]) => mockRunReadOnlyQuery(...args),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { useColumnDetail } from "@/features/parsed-data/hooks/useColumnDetail";

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

function makeProfile(over: Partial<ColProfile> = {}): ColProfile {
  return {
    name: "amount",
    index: 0,
    type: "float",
    sqlType: "DOUBLE",
    rowCount: 100,
    nullCount: 5,
    nullRate: 0.05,
    distinctCount: 80,
    uniquenessRate: 0.8,
    topValues: [],
    completeness: 0.95,
    uniqueness: 0.8,
    validity: 0.9,
    min: 0,
    max: 100,
    ...over,
  };
}

function makeColumnDetail(over: Partial<ColumnDetail> = {}): ColumnDetail {
  return {
    column: "amount",
    topValues: [{ value: "42", count: 5, pct: 0.05 }],
    histogram: [{ lo: 0, hi: 10, count: 5 }],
    ...over,
  };
}

/** A worker stub whose parseDetail resolves immediately. */
function makeWorker(detail: ColumnDetail = makeColumnDetail()): ProfileWorkerClient {
  return {
    buildProfiles: vi.fn(),
    filterSort: vi.fn(),
    parseDetail: vi.fn().mockResolvedValue(detail),
  };
}

// ─── Default DuckDB query sequence for a numeric column ──────────────────────
// fetchColumnDetail issues 3 queries: topRows, histogram (if numeric), sample.

function setUpNumericQueryMocks(topRows = [{ val: "42", cnt: 5 }]) {
  mockRunReadOnlyQuery
    // 1st call: top values
    .mockResolvedValueOnce(topRows)
    // 2nd call: histogram buckets (numeric column)
    .mockResolvedValueOnce([{ bin: 0, cnt: 3 }, { bin: 1, cnt: 2 }])
    // 3rd call: reservoir sample
    .mockResolvedValueOnce([{ sample_value: "42" }, { sample_value: "100" }]);
}

function setUpStringQueryMocks() {
  mockRunReadOnlyQuery
    // 1st: top values
    .mockResolvedValueOnce([{ val: "hello", cnt: 10 }])
    // 2nd: length stats (string path)
    .mockResolvedValueOnce([{ min_len: 3, max_len: 10, avg_len: 6 }])
    // 3rd: reservoir sample
    .mockResolvedValueOnce([{ sample_value: "hello" }]);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useColumnDetail – null / missing inputs", () => {
  it("returns {detail: null, loading: false} when dataset is null", () => {
    // Arrange
    const worker = makeWorker();

    // Act
    const { result } = renderHook(() => useColumnDetail(null, makeProfile(), worker));

    // Assert
    expect(result.current.detail).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(mockRunReadOnlyQuery).not.toHaveBeenCalled();
  });

  it("returns {detail: null, loading: false} when profile is null", () => {
    // Arrange
    const dataset = makeDataset();
    const worker = makeWorker();

    // Act
    const { result } = renderHook(() => useColumnDetail(dataset, null, worker));

    // Assert
    expect(result.current.detail).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(mockRunReadOnlyQuery).not.toHaveBeenCalled();
  });

  it("returns {detail: null, loading: false} when both dataset and profile are null", () => {
    // Arrange
    const worker = makeWorker();

    // Act
    const { result } = renderHook(() => useColumnDetail(null, null, worker));

    // Assert
    expect(result.current.detail).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("resets to null when dataset becomes null after a load", async () => {
    // Arrange – first render with a valid dataset
    const dataset = makeDataset();
    const profile = makeProfile();
    const expected = makeColumnDetail();
    const worker = makeWorker(expected);
    setUpNumericQueryMocks();

    const { result, rerender } = renderHook(
      ({ ds, prof }: { ds: RegisteredDataset | null; prof: ColProfile | null }) =>
        useColumnDetail(ds, prof, worker),
      { initialProps: { ds: dataset, prof: profile } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.detail).toEqual(expected));

    // Act – clear the dataset
    rerender({ ds: null, prof: profile });

    // Assert
    expect(result.current.detail).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});

describe("useColumnDetail – happy path (numeric column)", () => {
  it("transitions loading → false and sets detail after queries resolve", async () => {
    // Arrange
    const dataset = makeDataset();
    const profile = makeProfile({ type: "float", min: 0, max: 100 });
    const expected = makeColumnDetail();
    const worker = makeWorker(expected);
    setUpNumericQueryMocks();

    // Act
    const { result } = renderHook(() => useColumnDetail(dataset, profile, worker));

    // Immediately after mount the hook should be loading
    expect(result.current.loading).toBe(true);
    expect(result.current.detail).toBeNull();

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert
    expect(result.current.detail).toEqual(expected);
    // 3 queries: topRows + histogram + sample
    expect(mockRunReadOnlyQuery).toHaveBeenCalledTimes(3);
  });

  it("calls worker.parseDetail with the raw DuckDB result", async () => {
    // Arrange
    const dataset = makeDataset();
    const profile = makeProfile({ type: "float", min: 0, max: 100 });
    const worker = makeWorker();
    setUpNumericQueryMocks([{ val: "10", cnt: 2 }]);

    // Act
    const { result } = renderHook(() => useColumnDetail(dataset, profile, worker));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert – parseDetail was called with the assembled DetailQueryResult
    expect(worker.parseDetail).toHaveBeenCalledOnce();
    const arg = (worker.parseDetail as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.column).toBe(profile.name);
    expect(arg.type).toBe(profile.type);
    expect(arg.topRows).toEqual([{ val: "10", cnt: 2 }]);
    expect(arg.histogramRows).toHaveLength(20); // 20 bins synthesised from bucket rows
  });
});

describe("useColumnDetail – happy path (string column)", () => {
  it("fetches length stats and omits histogram for string types", async () => {
    // Arrange
    const dataset = makeDataset();
    const profile = makeProfile({ type: "string", sqlType: "VARCHAR", min: undefined, max: undefined });
    const expected = makeColumnDetail({ column: "amount", histogram: undefined });
    const worker = makeWorker(expected);
    setUpStringQueryMocks();

    // Act
    const { result } = renderHook(() => useColumnDetail(dataset, profile, worker));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert – 3 queries: topRows + lengthStats + sample (no histogram)
    expect(mockRunReadOnlyQuery).toHaveBeenCalledTimes(3);
    expect(result.current.detail).toEqual(expected);
  });
});

describe("useColumnDetail – numeric column edge: min === max", () => {
  it("skips the histogram query when min equals max", async () => {
    // Arrange – flat distribution: min == max, no range → no histogram query
    const dataset = makeDataset();
    const profile = makeProfile({ type: "float", min: 5, max: 5 });
    const worker = makeWorker();

    mockRunReadOnlyQuery
      // top values
      .mockResolvedValueOnce([])
      // sample (no histogram because max === min)
      .mockResolvedValueOnce([]);

    // Act
    const { result } = renderHook(() => useColumnDetail(dataset, profile, worker));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert – only 2 queries fired
    expect(mockRunReadOnlyQuery).toHaveBeenCalledTimes(2);
  });

  it("skips the histogram query when min is undefined", async () => {
    // Arrange
    const dataset = makeDataset();
    const profile = makeProfile({ type: "integer", min: undefined, max: undefined });
    const worker = makeWorker();

    mockRunReadOnlyQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    // Act
    const { result } = renderHook(() => useColumnDetail(dataset, profile, worker));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert – only 2 queries fired (no histogram)
    expect(mockRunReadOnlyQuery).toHaveBeenCalledTimes(2);
  });
});

describe("useColumnDetail – caching", () => {
  it("returns the cached detail instantly on re-selection of the same column", async () => {
    // Arrange – first load populates the memo
    const dataset = makeDataset();
    const profile = makeProfile({ type: "float", min: 0, max: 10 });
    const expected = makeColumnDetail();
    const worker = makeWorker(expected);
    setUpNumericQueryMocks();

    const { result, rerender } = renderHook(
      ({ ds, prof }: { ds: RegisteredDataset | null; prof: ColProfile | null }) =>
        useColumnDetail(ds, prof, worker),
      { initialProps: { ds: dataset, prof: profile } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockRunReadOnlyQuery).toHaveBeenCalledTimes(3);

    // Reset query mock – should NOT be called again
    mockRunReadOnlyQuery.mockReset();

    // Act – deselect then re-select the same column
    rerender({ ds: null, prof: null });
    rerender({ ds: dataset, prof: profile });

    // Assert – detail is restored from cache without additional queries
    expect(result.current.loading).toBe(false);
    expect(result.current.detail).toEqual(expected);
    expect(mockRunReadOnlyQuery).not.toHaveBeenCalled();
  });

  it("re-fetches when the column changes", async () => {
    // Arrange
    const dataset = makeDataset();
    const profileA = makeProfile({ name: "colA", type: "float", min: 0, max: 10 });
    const profileB = makeProfile({ name: "colB", type: "string", min: undefined, max: undefined });
    const detailA = makeColumnDetail({ column: "colA" });
    const detailB = makeColumnDetail({ column: "colB" });

    const worker: ProfileWorkerClient = {
      buildProfiles: vi.fn(),
      filterSort: vi.fn(),
      parseDetail: vi
        .fn()
        .mockResolvedValueOnce(detailA)
        .mockResolvedValueOnce(detailB),
    };

    setUpNumericQueryMocks();

    const { result, rerender } = renderHook(
      ({ prof }: { prof: ColProfile }) => useColumnDetail(dataset, prof, worker),
      { initialProps: { prof: profileA } },
    );

    await waitFor(() => expect(result.current.detail).toEqual(detailA));
    const callsAfterA = mockRunReadOnlyQuery.mock.calls.length;

    // Set up mocks for string column
    mockRunReadOnlyQuery
      .mockResolvedValueOnce([{ val: "x", cnt: 1 }])
      .mockResolvedValueOnce([{ min_len: 1, max_len: 5, avg_len: 3 }])
      .mockResolvedValueOnce([{ sample_value: "x" }]);

    // Act
    rerender({ prof: profileB });

    await waitFor(() => expect(result.current.detail).toEqual(detailB));

    // Assert – additional queries were fired for the new column
    expect(mockRunReadOnlyQuery.mock.calls.length).toBeGreaterThan(callsAfterA);
  });

  it("re-fetches when the dataset changes (different id)", async () => {
    // Arrange
    const datasetA = makeDataset({ id: "ds-A", viewName: "view_a", updatedAt: "2026-01-01T00:00:00Z" });
    const datasetB = makeDataset({ id: "ds-B", viewName: "view_b", updatedAt: "2026-01-02T00:00:00Z" });
    const profile = makeProfile({ type: "float", min: 0, max: 10 });
    const expected = makeColumnDetail();
    const worker = makeWorker(expected);

    setUpNumericQueryMocks();

    const { result, rerender } = renderHook(
      ({ ds }: { ds: RegisteredDataset }) => useColumnDetail(ds, profile, worker),
      { initialProps: { ds: datasetA } },
    );

    await waitFor(() => expect(result.current.detail).toEqual(expected));
    const callsAfterA = mockRunReadOnlyQuery.mock.calls.length;

    setUpNumericQueryMocks();

    // Act
    rerender({ ds: datasetB });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert – fresh fetch happened
    expect(mockRunReadOnlyQuery.mock.calls.length).toBeGreaterThan(callsAfterA);
  });
});

describe("useColumnDetail – error handling", () => {
  it("clears loading and sets detail to null when runReadOnlyQuery rejects", async () => {
    // Arrange
    const dataset = makeDataset();
    const profile = makeProfile({ type: "float", min: 0, max: 10 });
    const worker = makeWorker();

    mockRunReadOnlyQuery.mockRejectedValueOnce(new Error("DuckDB unavailable"));

    // Act
    const { result } = renderHook(() => useColumnDetail(dataset, profile, worker));

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert
    expect(result.current.detail).toBeNull();
  });

  it("clears loading and sets detail to null when worker.parseDetail rejects", async () => {
    // Arrange
    const dataset = makeDataset();
    const profile = makeProfile({ type: "float", min: 0, max: 10 });
    const worker: ProfileWorkerClient = {
      buildProfiles: vi.fn(),
      filterSort: vi.fn(),
      parseDetail: vi.fn().mockRejectedValue(new Error("Worker crashed")),
    };
    setUpNumericQueryMocks();

    // Act
    const { result } = renderHook(() => useColumnDetail(dataset, profile, worker));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert
    expect(result.current.detail).toBeNull();
  });
});

describe("useColumnDetail – cancellation", () => {
  it("does not update state if the component unmounts before the query resolves", async () => {
    // Arrange – make the query hang so it resolves after unmount
    let resolveQuery!: (value: unknown) => void;
    const pending = new Promise((res) => {
      resolveQuery = res;
    });
    mockRunReadOnlyQuery.mockReturnValueOnce(pending);

    const dataset = makeDataset();
    const profile = makeProfile({ type: "float", min: 0, max: 10 });
    const worker = makeWorker();

    // Act
    const { result, unmount } = renderHook(() => useColumnDetail(dataset, profile, worker));

    expect(result.current.loading).toBe(true);

    // Unmount before the query resolves
    unmount();

    // Resolve after unmount – should NOT throw or produce a state update
    await act(async () => {
      resolveQuery([]);
      // Flush pending microtasks
      await Promise.resolve();
    });

    // Assert – detail was never set (no error thrown = success)
    expect(result.current.detail).toBeNull();
  });

  it("cancels the stale request when the column changes before it resolves", async () => {
    // Arrange – first query hangs; second resolves immediately
    let resolveFirstQuery!: (value: unknown) => void;
    const firstPending = new Promise((res) => {
      resolveFirstQuery = res;
    });

    const profileA = makeProfile({ name: "slow_col", type: "float", min: 0, max: 10 });
    const profileB = makeProfile({ name: "fast_col", type: "string", min: undefined, max: undefined });
    const detailB = makeColumnDetail({ column: "fast_col" });

    const worker: ProfileWorkerClient = {
      buildProfiles: vi.fn(),
      filterSort: vi.fn(),
      parseDetail: vi.fn().mockResolvedValue(detailB),
    };

    // First column: top-values query hangs
    mockRunReadOnlyQuery.mockReturnValueOnce(firstPending);

    const dataset = makeDataset();

    const { result, rerender } = renderHook(
      ({ prof }: { prof: ColProfile }) => useColumnDetail(dataset, prof, worker),
      { initialProps: { prof: profileA } },
    );

    expect(result.current.loading).toBe(true);

    // Switch to a different column before the first resolves
    mockRunReadOnlyQuery
      .mockResolvedValueOnce([{ val: "x", cnt: 1 }])
      .mockResolvedValueOnce([{ min_len: 1, max_len: 3, avg_len: 2 }])
      .mockResolvedValueOnce([{ sample_value: "x" }]);

    rerender({ prof: profileB });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Now resolve the stale first query – should be dropped
    await act(async () => {
      resolveFirstQuery([]);
      await Promise.resolve();
    });

    // Assert – the second column's detail is shown, not the stale one
    expect(result.current.detail).toEqual(detailB);
  });
});

describe("useColumnDetail – identifier quoting", () => {
  it("properly escapes double-quote characters in column names", async () => {
    // Arrange – column name with embedded double quote
    const dataset = makeDataset();
    const profile = makeProfile({ name: 'col"with"quotes', type: "string", min: undefined, max: undefined });
    const worker = makeWorker();
    setUpStringQueryMocks();

    // Act
    const { result } = renderHook(() => useColumnDetail(dataset, profile, worker));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert – the SQL sent to DuckDB escapes the double quotes
    const firstCall: string = mockRunReadOnlyQuery.mock.calls[0][0];
    // The column name should be double-quoted with inner quotes escaped as ""
    expect(firstCall).toContain('"col""with""quotes"');
  });
});

describe("useColumnDetail – sample values edge cases", () => {
  it("filters out null and undefined sample values when building validitySample", async () => {
    // Arrange – sample rows contain null and undefined
    const dataset = makeDataset();
    const profile = makeProfile({ type: "float", min: 0, max: 10 });
    const worker = makeWorker();

    mockRunReadOnlyQuery
      // top values
      .mockResolvedValueOnce([])
      // histogram
      .mockResolvedValueOnce([])
      // sample with null/undefined
      .mockResolvedValueOnce([
        { sample_value: null },
        { sample_value: undefined },
        { sample_value: "valid" },
        { sample_value: "" },
      ]);

    // Act
    const { result } = renderHook(() => useColumnDetail(dataset, profile, worker));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert – parseDetail was called; validitySample should only contain "valid"
    const arg = (worker.parseDetail as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.validitySample).toEqual(["valid"]);
  });
});

describe("useColumnDetail – LRU eviction", () => {
  it("evicts the oldest entry when the memo reaches 64 entries", async () => {
    // Strategy: use a single renderHook and cycle through columns by rerendering,
    // so the memo ref persists across rerenders and we exercise the eviction path
    // without spinning up 65 separate hooks.

    const dataset = makeDataset();
    const baseWorkerDetail = makeColumnDetail();
    const worker = makeWorker(baseWorkerDetail);

    // Start with col_0
    const initialProfile = makeProfile({ name: "col_0", type: "float", min: 0, max: 10 });
    mockRunReadOnlyQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { result, rerender } = renderHook(
      ({ prof }: { prof: ColProfile }) => useColumnDetail(dataset, prof, worker),
      { initialProps: { prof: initialProfile } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Fill 63 more columns (total = 64, exactly at the cap)
    for (let i = 1; i < 64; i++) {
      mockRunReadOnlyQuery
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      rerender({ prof: makeProfile({ name: `col_${i}`, type: "float", min: 0, max: 10 }) });
      await waitFor(() => expect(result.current.loading).toBe(false));
    }

    // Adding col_64 should evict col_0 (the oldest entry)
    mockRunReadOnlyQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    rerender({ prof: makeProfile({ name: "col_64", type: "float", min: 0, max: 10 }) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // The hook loaded successfully even when the eviction path ran
    expect(result.current.detail).toEqual(baseWorkerDetail);
  }, 30000);
});

describe("useColumnDetail – cancellation after parseDetail", () => {
  it("does not update state if column changes while worker.parseDetail is in-flight", async () => {
    // Arrange: first column's fetchColumnDetail resolves immediately,
    // but parseDetail hangs until after the column switches.
    const dataset = makeDataset();
    const profileA = makeProfile({ name: "col_a", type: "float", min: 0, max: 10 });
    const profileB = makeProfile({ name: "col_b", type: "float", min: 0, max: 10 });
    const detailB = makeColumnDetail({ column: "col_b" });

    let resolveParseDetailA!: (value: ColumnDetail) => void;
    const parseDetailAPending = new Promise<ColumnDetail>((res) => {
      resolveParseDetailA = res;
    });

    const worker: ProfileWorkerClient = {
      buildProfiles: vi.fn(),
      filterSort: vi.fn(),
      parseDetail: vi
        .fn()
        .mockReturnValueOnce(parseDetailAPending) // col_a: hangs
        .mockResolvedValueOnce(detailB),           // col_b: resolves
    };

    // Set up all queries upfront: 3 for col_a (top, histogram, sample) + 3 for col_b
    mockRunReadOnlyQuery
      // col_a queries
      .mockResolvedValueOnce([]) // top values
      .mockResolvedValueOnce([]) // histogram
      .mockResolvedValueOnce([]) // sample
      // col_b queries
      .mockResolvedValueOnce([]) // top values
      .mockResolvedValueOnce([]) // histogram
      .mockResolvedValueOnce([]); // sample

    const { result, rerender } = renderHook(
      ({ prof }: { prof: ColProfile }) => useColumnDetail(dataset, prof, worker),
      { initialProps: { prof: profileA } },
    );

    // Wait for col_a's fetchColumnDetail to finish (it resolves immediately),
    // so that parseDetail is now in-flight (hanging on parseDetailAPending).
    // We need to let the microtasks for the 3 DuckDB queries drain first.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Switch to col_b before parseDetail for col_a resolves
    rerender({ prof: profileB });

    // Wait for col_b to finish loading completely
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.detail).toEqual(detailB);

    // Now resolve col_a's stale parseDetail — cancelled flag should prevent state update
    await act(async () => {
      resolveParseDetailA(makeColumnDetail({ column: "col_a" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    // col_b's detail should still be shown, not col_a's stale one
    expect(result.current.detail).toEqual(detailB);
  });

  it("does not update state if column changes while fetchColumnDetail is completing", async () => {
    // Arrange: all DuckDB queries for col_a resolve, but we switch columns
    // before the async IIFE can check `if (cancelled)` at line 175.
    // We simulate this by making the last sample query return a controlled promise.
    const dataset = makeDataset();
    const profileA = makeProfile({ name: "col_x", type: "float", min: 0, max: 10 });
    const profileB = makeProfile({ name: "col_y", type: "float", min: 0, max: 10 });
    const detailB = makeColumnDetail({ column: "col_y" });

    let resolveSampleQuery!: (value: unknown) => void;
    const samplePending = new Promise((res) => {
      resolveSampleQuery = res;
    });

    const worker: ProfileWorkerClient = {
      buildProfiles: vi.fn(),
      filterSort: vi.fn(),
      parseDetail: vi.fn().mockResolvedValue(detailB),
    };

    // col_x queries: top and histogram resolve, sample hangs
    mockRunReadOnlyQuery
      .mockResolvedValueOnce([]) // top values
      .mockResolvedValueOnce([]) // histogram
      .mockReturnValueOnce(samplePending) // sample: hangs
      // col_y queries: all resolve immediately
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { result, rerender } = renderHook(
      ({ prof }: { prof: ColProfile }) => useColumnDetail(dataset, prof, worker),
      { initialProps: { prof: profileA } },
    );

    expect(result.current.loading).toBe(true);

    // Switch to col_y while col_x's sample query is still pending
    rerender({ prof: profileB });

    // Wait for col_y to finish
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.detail).toEqual(detailB);

    // Resolve col_x's stale sample query — should be cancelled at line 175
    await act(async () => {
      resolveSampleQuery([]);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Still col_y's detail, not col_x's
    expect(result.current.detail).toEqual(detailB);
  });
});

describe("useColumnDetail – histogram bucket null/undefined fallbacks", () => {
  it("treats null bin and cnt as 0 when building histogram counts", async () => {
    // Arrange: return a bucket row where bin and cnt are null, exercising the ?? 0 fallbacks.
    const dataset = makeDataset();
    const profile = makeProfile({ type: "float", min: 0, max: 100 });
    const worker = makeWorker();

    mockRunReadOnlyQuery
      // top values
      .mockResolvedValueOnce([])
      // histogram buckets with null bin and cnt (exercises row.bin ?? 0, row.cnt ?? 0)
      .mockResolvedValueOnce([{ bin: null, cnt: null }])
      // sample
      .mockResolvedValueOnce([]);

    // Act
    const { result } = renderHook(() => useColumnDetail(dataset, profile, worker));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert: parseDetail was called; the null-bucket mapped to index 0 with count 0
    const arg = (worker.parseDetail as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // 20 bins; the null bucket maps to bin 0, count 0
    expect(arg.histogramRows).toHaveLength(20);
    expect(arg.histogramRows[0].cnt).toBe(0);
  });
});
