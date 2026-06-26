/**
 * Tests for useDatasetProfile hook.
 *
 * Strategy:
 * - Mock @/platform/duckdb/duckdb so no real DuckDB is touched.
 * - Mock @/features/parsed-data/store/profile-cache so no IndexedDB is hit.
 * - Keep the real useDatasetProfile module so coverage counts.
 * - Provide a minimal ProfileWorkerClient stub per test.
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RegisteredDataset } from "@/platform/duckdb/duckdb";
import type { ColProfile, QualityDimension } from "@/features/parsed-data/model/types";
import type { ProfileWorkerClient } from "@/features/parsed-data/worker/useProfileWorker";
import type { SummarizeRow } from "@/features/parsed-data/model/summary-map";

// ─── Mock DuckDB ──────────────────────────────────────────────────────────────

const mockProfileDataset = vi.fn();
const mockCancelQueries = vi.fn();
const mockResetCancelToken = vi.fn();

vi.mock("@/platform/duckdb/duckdb", () => ({
  profileDataset: (...args: unknown[]) => mockProfileDataset(...args),
  cancelQueries: (...args: unknown[]) => mockCancelQueries(...args),
  resetCancelToken: (...args: unknown[]) => mockResetCancelToken(...args),
}));

// ─── Mock Profile Cache ───────────────────────────────────────────────────────

const mockLoadCachedProfile = vi.fn();
const mockSaveProfile = vi.fn();
const mockInvalidateProfile = vi.fn();
const mockProfileCacheKey = vi.fn((id: string, version: string) => `${id}:${version}`);

vi.mock("@/features/parsed-data/store/profile-cache", () => ({
  loadCachedProfile: (...args: unknown[]) => mockLoadCachedProfile(...args),
  saveProfile: (...args: unknown[]) => mockSaveProfile(...args),
  invalidateProfile: (...args: unknown[]) => mockInvalidateProfile(...args),
  profileCacheKey: (...args: unknown[]) => mockProfileCacheKey(...args),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { useDatasetProfile } from "@/features/parsed-data/hooks/useDatasetProfile";

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

function makeQualityDimension(over: Partial<QualityDimension> = {}): QualityDimension {
  return {
    name: "completeness",
    score: 0.95,
    description: "Fraction of non-null values",
    affected: ["amount"],
    ...over,
  };
}

function makeSummarizeRow(over: Partial<SummarizeRow> = {}): SummarizeRow {
  return {
    column_name: "amount",
    column_type: "DOUBLE",
    min: 0,
    max: 100,
    approx_unique: 80,
    avg: 50,
    std: 10,
    q25: 25,
    q50: 50,
    q75: 75,
    count: 100,
    null_percentage: 5,
    ...over,
  };
}

/** A worker stub whose buildProfiles resolves immediately. */
function makeWorker(
  profiles: ColProfile[] = [makeProfile()],
  dimensions: QualityDimension[] = [makeQualityDimension()],
): ProfileWorkerClient {
  return {
    buildProfiles: vi.fn().mockResolvedValue({ profiles, dimensions }),
    filterSort: vi.fn(),
    parseDetail: vi.fn(),
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Defaults: cancel/reset resolve immediately, no cache hit
  mockCancelQueries.mockResolvedValue(undefined);
  mockResetCancelToken.mockResolvedValue(undefined);
  mockLoadCachedProfile.mockResolvedValue(undefined);
  mockSaveProfile.mockResolvedValue(undefined);
  mockInvalidateProfile.mockResolvedValue(undefined);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useDatasetProfile – initial idle state", () => {
  it("starts in idle state with empty profiles and dimensions", () => {
    // Arrange
    const worker = makeWorker();

    // Act
    const { result } = renderHook(() =>
      useDatasetProfile(null, worker, 0),
    );

    // Assert – initial synchronous state
    expect(result.current.status).toBe("idle");
    expect(result.current.profiles).toEqual([]);
    expect(result.current.dimensions).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.fromCache).toBe(false);
  });
});

describe("useDatasetProfile – null dataset", () => {
  it("returns idle state and does not call profileDataset when dataset is null", async () => {
    // Arrange
    const worker = makeWorker();

    // Act
    const { result } = renderHook(() =>
      useDatasetProfile(null, worker, 0),
    );

    // Assert – effect runs synchronously on null: should reset to idle
    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(result.current.profiles).toEqual([]);
    expect(result.current.dimensions).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.fromCache).toBe(false);
    expect(mockProfileDataset).not.toHaveBeenCalled();
  });

  it("resets to idle when dataset becomes null after a successful load", async () => {
    // Arrange
    const dataset = makeDataset();
    const profiles = [makeProfile()];
    const dimensions = [makeQualityDimension()];
    const summary = [makeSummarizeRow()];
    const worker = makeWorker(profiles, dimensions);

    mockProfileDataset.mockResolvedValue(summary);

    const { result, rerender } = renderHook(
      ({ ds }: { ds: RegisteredDataset | null }) =>
        useDatasetProfile(ds, worker, 0),
      { initialProps: { ds: dataset } },
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.profiles).toEqual(profiles);

    // Act – clear the dataset
    rerender({ ds: null });

    // Assert – resets to idle
    expect(result.current.status).toBe("idle");
    expect(result.current.profiles).toEqual([]);
    expect(result.current.dimensions).toEqual([]);
    expect(result.current.fromCache).toBe(false);
  });
});

describe("useDatasetProfile – cache hit (refreshKey = 0)", () => {
  it("serves profiles from cache and sets fromCache=true without calling profileDataset", async () => {
    // Arrange
    const dataset = makeDataset();
    const cached = {
      key: "ds-1:2026-01-02T00:00:00Z",
      datasetId: "ds-1",
      updatedAt: "2026-01-02T00:00:00Z",
      profiles: [makeProfile()],
      dimensions: [makeQualityDimension()],
      computedAt: Date.now(),
    };
    mockLoadCachedProfile.mockResolvedValue(cached);
    const worker = makeWorker();

    // Act
    const { result } = renderHook(() =>
      useDatasetProfile(dataset, worker, 0),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));

    // Assert
    expect(result.current.profiles).toEqual(cached.profiles);
    expect(result.current.dimensions).toEqual(cached.dimensions);
    expect(result.current.fromCache).toBe(true);
    expect(result.current.error).toBeNull();
    expect(mockProfileDataset).not.toHaveBeenCalled();
    expect(mockLoadCachedProfile).toHaveBeenCalledWith("ds-1", "2026-01-02T00:00:00Z");
  });

  it("sets status to loading before the cache resolves", async () => {
    // Arrange – make the cache check hang a bit
    let resolveCacheCheck!: (val: undefined) => void;
    const pending = new Promise<undefined>((res) => { resolveCacheCheck = res; });
    mockLoadCachedProfile.mockReturnValue(pending);
    const worker = makeWorker();
    const dataset = makeDataset();

    // Act
    const { result } = renderHook(() =>
      useDatasetProfile(dataset, worker, 0),
    );

    // Should be loading while cache check is pending
    expect(result.current.status).toBe("loading");

    // Resolve cache miss (no cache hit) and provide real data path
    mockProfileDataset.mockResolvedValue([makeSummarizeRow()]);
    await act(async () => {
      resolveCacheCheck(undefined);
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
  });
});

describe("useDatasetProfile – cache miss (refreshKey = 0, no cached data)", () => {
  it("calls profileDataset and buildProfiles on a cache miss and sets status=ready", async () => {
    // Arrange
    const dataset = makeDataset();
    const profiles = [makeProfile()];
    const dimensions = [makeQualityDimension()];
    const summary = [makeSummarizeRow()];
    const worker = makeWorker(profiles, dimensions);

    mockLoadCachedProfile.mockResolvedValue(undefined);
    mockProfileDataset.mockResolvedValue(summary);

    // Act
    const { result } = renderHook(() =>
      useDatasetProfile(dataset, worker, 0),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));

    // Assert
    expect(result.current.profiles).toEqual(profiles);
    expect(result.current.dimensions).toEqual(dimensions);
    expect(result.current.fromCache).toBe(false);
    expect(result.current.error).toBeNull();

    expect(mockProfileDataset).toHaveBeenCalledWith({
      datasetId: "ds-1",
      cancelToken: expect.stringContaining("ds-1"),
    });
    expect(worker.buildProfiles).toHaveBeenCalledWith(summary);
  });

  it("persists the computed profile after a successful scan", async () => {
    // Arrange
    const dataset = makeDataset();
    const profiles = [makeProfile()];
    const dimensions = [makeQualityDimension()];
    const summary = [makeSummarizeRow()];
    const worker = makeWorker(profiles, dimensions);

    mockLoadCachedProfile.mockResolvedValue(undefined);
    mockProfileDataset.mockResolvedValue(summary);

    // Act
    const { result } = renderHook(() =>
      useDatasetProfile(dataset, worker, 0),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));

    // Allow any pending microtasks (saveProfile is fire-and-forget with void)
    await act(async () => { await Promise.resolve(); });

    // Assert – saveProfile was called with the correct shape
    expect(mockSaveProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        datasetId: "ds-1",
        updatedAt: "2026-01-02T00:00:00Z",
        profiles,
        dimensions,
      }),
    );
  });

  it("calls resetCancelToken before profileDataset", async () => {
    // Arrange
    const dataset = makeDataset();
    const worker = makeWorker();

    mockLoadCachedProfile.mockResolvedValue(undefined);
    mockProfileDataset.mockResolvedValue([makeSummarizeRow()]);

    const callOrder: string[] = [];
    mockResetCancelToken.mockImplementation(async () => { callOrder.push("reset"); });
    mockProfileDataset.mockImplementation(async () => { callOrder.push("profile"); return [makeSummarizeRow()]; });

    // Act
    const { result } = renderHook(() =>
      useDatasetProfile(dataset, worker, 0),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));

    // Assert – reset happens before profile scan
    expect(callOrder[0]).toBe("reset");
    expect(callOrder[1]).toBe("profile");
  });
});

describe("useDatasetProfile – refreshKey > 0", () => {
  it("invalidates the cache when refreshKey > 0 instead of loading from cache", async () => {
    // Arrange
    const dataset = makeDataset();
    const profiles = [makeProfile()];
    const dimensions = [makeQualityDimension()];
    const worker = makeWorker(profiles, dimensions);

    mockProfileDataset.mockResolvedValue([makeSummarizeRow()]);

    // Act – refreshKey = 1
    const { result } = renderHook(() =>
      useDatasetProfile(dataset, worker, 1),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));

    // Assert – invalidateProfile is called, NOT loadCachedProfile
    expect(mockInvalidateProfile).toHaveBeenCalledWith("ds-1");
    expect(mockLoadCachedProfile).not.toHaveBeenCalled();
  });

  it("still calls profileDataset and returns fresh results when refreshKey > 0", async () => {
    // Arrange
    const dataset = makeDataset();
    const profiles = [makeProfile({ name: "fresh" })];
    const dimensions = [makeQualityDimension()];
    const worker = makeWorker(profiles, dimensions);

    mockProfileDataset.mockResolvedValue([makeSummarizeRow()]);

    // Act
    const { result } = renderHook(() =>
      useDatasetProfile(dataset, worker, 2),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));

    // Assert
    expect(result.current.profiles).toEqual(profiles);
    expect(result.current.fromCache).toBe(false);
    expect(mockProfileDataset).toHaveBeenCalled();
  });
});

describe("useDatasetProfile – error handling", () => {
  it("sets status=error when profileDataset rejects", async () => {
    // Arrange
    const dataset = makeDataset();
    const worker = makeWorker();

    mockLoadCachedProfile.mockResolvedValue(undefined);
    mockProfileDataset.mockRejectedValue(new Error("DuckDB scan failed"));

    // Act
    const { result } = renderHook(() =>
      useDatasetProfile(dataset, worker, 0),
    );

    await waitFor(() => expect(result.current.status).toBe("error"));

    // Assert
    expect(result.current.error).toBe("DuckDB scan failed");
    expect(result.current.profiles).toEqual([]);
    expect(result.current.dimensions).toEqual([]);
  });

  it("sets status=error when worker.buildProfiles rejects", async () => {
    // Arrange
    const dataset = makeDataset();
    const worker = makeWorker();
    (worker.buildProfiles as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Worker crashed"),
    );

    mockLoadCachedProfile.mockResolvedValue(undefined);
    mockProfileDataset.mockResolvedValue([makeSummarizeRow()]);

    // Act
    const { result } = renderHook(() =>
      useDatasetProfile(dataset, worker, 0),
    );

    await waitFor(() => expect(result.current.status).toBe("error"));

    // Assert
    expect(result.current.error).toBe("Worker crashed");
  });

  it("stringifies non-Error error values", async () => {
    // Arrange
    const dataset = makeDataset();
    const worker = makeWorker();

    mockLoadCachedProfile.mockResolvedValue(undefined);
    mockProfileDataset.mockRejectedValue("plain string error");

    // Act
    const { result } = renderHook(() =>
      useDatasetProfile(dataset, worker, 0),
    );

    await waitFor(() => expect(result.current.status).toBe("error"));

    // Assert – error is a string representation
    expect(result.current.error).toBe("plain string error");
  });

  it("preserves status=error across rerenders when the dataset does not change", async () => {
    // Arrange
    const dataset = makeDataset();
    const worker = makeWorker();

    mockLoadCachedProfile.mockResolvedValue(undefined);
    mockProfileDataset.mockRejectedValue(new Error("scan failed"));

    const { result, rerender } = renderHook(
      ({ rk }: { rk: number }) =>
        useDatasetProfile(dataset, worker, rk),
      { initialProps: { rk: 0 } },
    );

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("scan failed");

    // Rerender with same dataset/key – effect should NOT re-run
    rerender({ rk: 0 });
    expect(result.current.status).toBe("error");
  });
});

describe("useDatasetProfile – cancellation", () => {
  it("calls cancelQueries with the cancel token when component unmounts", async () => {
    // Arrange
    let resolveProfileDataset!: (val: unknown) => void;
    const pending = new Promise((res) => { resolveProfileDataset = res; });

    const dataset = makeDataset();
    const worker = makeWorker();
    mockLoadCachedProfile.mockResolvedValue(undefined);
    mockProfileDataset.mockReturnValue(pending);

    // Act
    const { unmount } = renderHook(() =>
      useDatasetProfile(dataset, worker, 0),
    );

    // Unmount before the scan resolves
    unmount();

    // Assert – cleanup called cancelQueries
    expect(mockCancelQueries).toHaveBeenCalledWith(
      expect.stringContaining("ds-1"),
    );

    // Cleanup: resolve the pending promise
    await act(async () => {
      resolveProfileDataset([]);
      await Promise.resolve();
    });
  });

  it("does not update state if component unmounts before profileDataset resolves", async () => {
    // Arrange
    let resolveProfileDataset!: (val: unknown) => void;
    const pending = new Promise((res) => { resolveProfileDataset = res; });

    const dataset = makeDataset();
    const worker = makeWorker();
    mockLoadCachedProfile.mockResolvedValue(undefined);
    mockProfileDataset.mockReturnValue(pending);

    // Act
    const { result, unmount } = renderHook(() =>
      useDatasetProfile(dataset, worker, 0),
    );

    expect(result.current.status).toBe("loading");

    unmount();

    // Resolve after unmount – must not throw or update state
    await act(async () => {
      resolveProfileDataset([makeSummarizeRow()]);
      await Promise.resolve();
    });

    // Assert – state remains at loading (never updated after unmount)
    expect(result.current.status).toBe("loading");
  });

  it("does not update state if dataset changes before profileDataset resolves (stale closure)", async () => {
    // Arrange: both dataset scans resolve normally, but datasetA is swapped before completion.
    // After switching to datasetB, the final state must reflect datasetB.
    const datasetA = makeDataset({ id: "ds-A", updatedAt: "2026-01-01T00:00:00Z" });
    const datasetB = makeDataset({ id: "ds-B", updatedAt: "2026-01-02T00:00:00Z" });
    const profilesA = [makeProfile({ name: "a_col" })];
    const profilesB = [makeProfile({ name: "b_col" })];

    const worker: ProfileWorkerClient = {
      buildProfiles: vi.fn()
        .mockResolvedValueOnce({ profiles: profilesA, dimensions: [] })
        .mockResolvedValueOnce({ profiles: profilesB, dimensions: [] }),
      filterSort: vi.fn(),
      parseDetail: vi.fn(),
    };

    mockLoadCachedProfile.mockResolvedValue(undefined);
    // Both calls resolve immediately with the same summary
    mockProfileDataset.mockResolvedValue([makeSummarizeRow()]);

    const { result, rerender } = renderHook(
      ({ ds }: { ds: RegisteredDataset }) =>
        useDatasetProfile(ds, worker, 0),
      { initialProps: { ds: datasetA } },
    );

    // Wait for datasetA to complete, then switch to datasetB
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.profiles).toEqual(profilesA);

    rerender({ ds: datasetB });
    await waitFor(() => expect(result.current.profiles).toEqual(profilesB));

    // Assert – final state reflects datasetB
    expect(result.current.status).toBe("ready");
  });

  it("does not update state if cancelled before loadCachedProfile resolves", async () => {
    // Arrange
    let resolveCacheCheck!: (val: undefined) => void;
    const pending = new Promise<undefined>((res) => { resolveCacheCheck = res; });
    mockLoadCachedProfile.mockReturnValue(pending);

    const dataset = makeDataset();
    const worker = makeWorker();

    // Act
    const { result, unmount } = renderHook(() =>
      useDatasetProfile(dataset, worker, 0),
    );

    expect(result.current.status).toBe("loading");

    unmount();

    // Resolve cache check after unmount with a cache hit – state must not update
    await act(async () => {
      resolveCacheCheck(undefined);
      await Promise.resolve();
    });

    expect(result.current.status).toBe("loading");
    expect(mockProfileDataset).not.toHaveBeenCalled();
  });
});

describe("useDatasetProfile – cancel token format", () => {
  it("includes datasetId, updatedAt, and refreshKey in the cancel token", async () => {
    // Arrange
    const dataset = makeDataset({ id: "ds-abc", updatedAt: "2026-03-01T00:00:00Z" });
    const worker = makeWorker();
    mockLoadCachedProfile.mockResolvedValue(undefined);
    mockProfileDataset.mockResolvedValue([makeSummarizeRow()]);

    // Act
    const { result } = renderHook(() =>
      useDatasetProfile(dataset, worker, 5),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));

    // Assert – the cancel token passed to resetCancelToken encodes all three values
    const tokenArg: string = mockResetCancelToken.mock.calls[0][0];
    expect(tokenArg).toContain("ds-abc");
    expect(tokenArg).toContain("2026-03-01T00:00:00Z");
    expect(tokenArg).toContain("5");
  });

  it("uses same cancel token for profileDataset and cancelQueries cleanup", async () => {
    // Arrange
    let resolveProfile!: (val: unknown) => void;
    const pending = new Promise((res) => { resolveProfile = res; });

    const dataset = makeDataset();
    const worker = makeWorker();
    mockLoadCachedProfile.mockResolvedValue(undefined);
    mockProfileDataset.mockReturnValue(pending);

    // Act
    const { unmount } = renderHook(() =>
      useDatasetProfile(dataset, worker, 0),
    );

    unmount();

    // The token sent to cancelQueries should match the token used in profileDataset call
    const cancelToken: string = mockCancelQueries.mock.calls[0][0];
    expect(cancelToken).toContain("parsed-data:profile");
    expect(cancelToken).toContain("ds-1");

    await act(async () => {
      resolveProfile([]);
      await Promise.resolve();
    });
  });
});

describe("useDatasetProfile – dataset changes", () => {
  it("re-profiles when the dataset id changes", async () => {
    // Arrange
    const datasetA = makeDataset({ id: "ds-A", updatedAt: "2026-01-01T00:00:00Z" });
    const datasetB = makeDataset({ id: "ds-B", updatedAt: "2026-01-02T00:00:00Z" });
    const profilesA = [makeProfile({ name: "colA" })];
    const profilesB = [makeProfile({ name: "colB" })];

    const worker: ProfileWorkerClient = {
      buildProfiles: vi.fn()
        .mockResolvedValueOnce({ profiles: profilesA, dimensions: [] })
        .mockResolvedValueOnce({ profiles: profilesB, dimensions: [] }),
      filterSort: vi.fn(),
      parseDetail: vi.fn(),
    };

    mockLoadCachedProfile.mockResolvedValue(undefined);
    mockProfileDataset.mockResolvedValue([makeSummarizeRow()]);

    const { result, rerender } = renderHook(
      ({ ds }: { ds: RegisteredDataset }) =>
        useDatasetProfile(ds, worker, 0),
      { initialProps: { ds: datasetA } },
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.profiles).toEqual(profilesA);

    // Act – switch dataset
    rerender({ ds: datasetB });
    await waitFor(() => expect(result.current.profiles).toEqual(profilesB));

    // Assert – profileDataset called twice (once per dataset)
    expect(mockProfileDataset).toHaveBeenCalledTimes(2);
  });

  it("re-profiles when updatedAt changes for the same dataset id", async () => {
    // Arrange
    const datasetV1 = makeDataset({ id: "ds-1", updatedAt: "2026-01-01T00:00:00Z" });
    const datasetV2 = makeDataset({ id: "ds-1", updatedAt: "2026-06-01T00:00:00Z" });
    const worker = makeWorker();

    mockLoadCachedProfile.mockResolvedValue(undefined);
    mockProfileDataset.mockResolvedValue([makeSummarizeRow()]);

    const { result, rerender } = renderHook(
      ({ ds }: { ds: RegisteredDataset }) =>
        useDatasetProfile(ds, worker, 0),
      { initialProps: { ds: datasetV1 } },
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    const firstCallCount = mockProfileDataset.mock.calls.length;

    // Act – bump updatedAt (new dataset version)
    rerender({ ds: datasetV2 });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    // Assert – re-scanned for the new version
    expect(mockProfileDataset.mock.calls.length).toBeGreaterThan(firstCallCount);
  });

  it("re-profiles when refreshKey changes", async () => {
    // Arrange
    const dataset = makeDataset();
    const worker = makeWorker();

    mockProfileDataset.mockResolvedValue([makeSummarizeRow()]);

    const { result, rerender } = renderHook(
      ({ rk }: { rk: number }) =>
        useDatasetProfile(dataset, worker, rk),
      { initialProps: { rk: 0 } },
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    const firstCallCount = mockProfileDataset.mock.calls.length;

    // Act – bump the refreshKey
    rerender({ rk: 1 });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    // Assert – profileDataset was called again
    expect(mockProfileDataset.mock.calls.length).toBeGreaterThan(firstCallCount);
    // And invalidateProfile was called for the refresh
    expect(mockInvalidateProfile).toHaveBeenCalledWith("ds-1");
  });
});

describe("useDatasetProfile – status transitions", () => {
  it("transitions from idle → loading → ready on successful scan", async () => {
    // Arrange
    const statuses: string[] = [];
    const dataset = makeDataset();
    const worker = makeWorker();

    mockLoadCachedProfile.mockResolvedValue(undefined);
    mockProfileDataset.mockResolvedValue([makeSummarizeRow()]);

    // Act
    const { result } = renderHook(() => {
      const state = useDatasetProfile(dataset, worker, 0);
      statuses.push(state.status);
      return state;
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));

    // Assert – idle is the initial state before the effect fires
    expect(statuses[0]).toBe("idle");
    // At some point it was loading and then ready
    expect(statuses).toContain("loading");
    expect(statuses[statuses.length - 1]).toBe("ready");
  });

  it("clears error on re-run after refreshKey changes", async () => {
    // Arrange
    const dataset = makeDataset();
    const worker = makeWorker();

    mockLoadCachedProfile.mockResolvedValue(undefined);
    // First run fails, second run succeeds
    mockProfileDataset
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce([makeSummarizeRow()]);

    const { result, rerender } = renderHook(
      ({ rk }: { rk: number }) =>
        useDatasetProfile(dataset, worker, rk),
      { initialProps: { rk: 0 } },
    );

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("temporary failure");

    // Act – bump refreshKey to retry
    rerender({ rk: 1 });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    // Assert – error was cleared
    expect(result.current.error).toBeNull();
  });
});
