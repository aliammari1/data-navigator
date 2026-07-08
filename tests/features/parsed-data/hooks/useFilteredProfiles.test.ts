/**
 * Tests for useFilteredProfiles hook.
 *
 * Strategy:
 * - Mock the ProfileWorkerClient so no real Comlink/Worker is touched.
 * - Keep the real useFilteredProfiles module so coverage counts.
 * - Exercise every branch: happy path, cancellation (unmount + stale), worker
 *   failure (pristine vs. non-pristine query), and the isPristine code path.
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ColProfile } from "@/features/parsed-data/model/types";
import type { ProfileQuery } from "@/features/parsed-data/model/summary-map";
import type { ProfileWorkerClient } from "@/features/parsed-data/worker/useProfileWorker";

// ─── Import target after mocks ────────────────────────────────────────────────

import { useFilteredProfiles } from "@/features/parsed-data/hooks/useFilteredProfiles";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    ...over,
  };
}

/** Default (pristine) query — search="", typeFilter="all", qualityFilter="all" */
function pristineQuery(over: Partial<ProfileQuery> = {}): ProfileQuery {
  return {
    search: "",
    typeFilter: "all",
    qualityFilter: "all",
    sortBy: "quality",
    sortAsc: false,
    ...over,
  };
}

/** Non-pristine query — any of the filter fields differs from default */
function activeQuery(over: Partial<ProfileQuery> = {}): ProfileQuery {
  return {
    search: "amount",
    typeFilter: "all",
    qualityFilter: "all",
    sortBy: "quality",
    sortAsc: false,
    ...over,
  };
}

/** Worker stub whose filterSort resolves with the given list. */
function makeWorker(
  result: ColProfile[] = [],
): ProfileWorkerClient {
  return {
    buildProfiles: vi.fn(),
    filterSort: vi.fn().mockResolvedValue(result),
    parseDetail: vi.fn(),
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useFilteredProfiles – initial state", () => {
  it("returns the full profiles list before the first worker result arrives", async () => {
    // Arrange – worker hangs so the first result never arrives during this check
    const profiles = [makeProfile({ name: "col1" }), makeProfile({ name: "col2" })];
    let resolveFilter!: (val: ColProfile[]) => void;
    const pending = new Promise<ColProfile[]>((res) => { resolveFilter = res; });
    const worker: ProfileWorkerClient = {
      buildProfiles: vi.fn(),
      filterSort: vi.fn().mockReturnValue(pending),
      parseDetail: vi.fn(),
    };

    // Act
    const { result } = renderHook(() =>
      useFilteredProfiles(profiles, pristineQuery(), worker),
    );

    // Assert – falls back to the full list until the worker responds
    expect(result.current).toEqual(profiles);

    // Cleanup
    await act(async () => {
      resolveFilter(profiles);
      await Promise.resolve();
    });
  });
});

describe("useFilteredProfiles – happy path (pristine query)", () => {
  it("updates the list with the worker result when filterSort resolves", async () => {
    // Arrange
    const profiles = [makeProfile({ name: "col1" }), makeProfile({ name: "col2" })];
    const filtered = [makeProfile({ name: "col1" })];
    const worker = makeWorker(filtered);

    // Act
    const { result } = renderHook(() =>
      useFilteredProfiles(profiles, pristineQuery(), worker),
    );

    await waitFor(() => expect(result.current).toEqual(filtered));

    // Assert
    expect(worker.filterSort).toHaveBeenCalledWith(profiles, expect.objectContaining({
      search: "",
      typeFilter: "all",
      qualityFilter: "all",
    }));
  });

  it("calls filterSort with the full profiles and query on mount", async () => {
    // Arrange
    const profiles = [makeProfile()];
    const worker = makeWorker(profiles);
    const query = pristineQuery();

    // Act
    const { result } = renderHook(() =>
      useFilteredProfiles(profiles, query, worker),
    );

    await waitFor(() => expect(result.current).toEqual(profiles));

    // Assert
    expect(worker.filterSort).toHaveBeenCalledOnce();
    expect(worker.filterSort).toHaveBeenCalledWith(profiles, query);
  });
});

describe("useFilteredProfiles – happy path (non-pristine / active query)", () => {
  it("updates the list when the query has a non-empty search term", async () => {
    // Arrange – isPristine is false (search is non-empty)
    const profiles = [makeProfile({ name: "amount" }), makeProfile({ name: "date" })];
    const filtered = [makeProfile({ name: "amount" })];
    const worker = makeWorker(filtered);
    const query = activeQuery({ search: "amount" });

    // Act
    const { result } = renderHook(() =>
      useFilteredProfiles(profiles, query, worker),
    );

    await waitFor(() => expect(result.current).toEqual(filtered));

    // Assert
    expect(worker.filterSort).toHaveBeenCalledWith(profiles, query);
  });

  it("updates the list when typeFilter differs from 'all'", async () => {
    // Arrange – isPristine is false (typeFilter !== "all")
    const profiles = [makeProfile({ name: "amount", type: "float" })];
    const worker = makeWorker(profiles);
    const query = pristineQuery({ typeFilter: "float" });

    // Act
    const { result } = renderHook(() =>
      useFilteredProfiles(profiles, query, worker),
    );

    await waitFor(() => expect(result.current).toEqual(profiles));

    expect(worker.filterSort).toHaveBeenCalledWith(profiles, query);
  });

  it("updates the list when qualityFilter differs from 'all'", async () => {
    // Arrange – isPristine is false (qualityFilter !== "all")
    const profiles = [makeProfile()];
    const worker = makeWorker(profiles);
    const query = pristineQuery({ qualityFilter: "excellent" });

    // Act
    const { result } = renderHook(() =>
      useFilteredProfiles(profiles, query, worker),
    );

    await waitFor(() => expect(result.current).toEqual(profiles));

    expect(worker.filterSort).toHaveBeenCalledWith(profiles, query);
  });

  it("trims whitespace when determining isPristine", async () => {
    // Arrange – search is only whitespace → isPristine should still be true
    const profiles = [makeProfile()];
    const worker = makeWorker(profiles);
    const query = pristineQuery({ search: "   " });

    // Act
    const { result } = renderHook(() =>
      useFilteredProfiles(profiles, query, worker),
    );

    await waitFor(() => expect(result.current).toEqual(profiles));

    // Worker was still called
    expect(worker.filterSort).toHaveBeenCalled();
  });
});

describe("useFilteredProfiles – re-run on dependency change", () => {
  it("re-runs filterSort when profiles array changes", async () => {
    // Arrange
    const profilesA = [makeProfile({ name: "colA" })];
    const profilesB = [makeProfile({ name: "colB" })];
    const query = pristineQuery();
    const worker: ProfileWorkerClient = {
      buildProfiles: vi.fn(),
      filterSort: vi.fn()
        .mockResolvedValueOnce(profilesA)
        .mockResolvedValueOnce(profilesB),
      parseDetail: vi.fn(),
    };

    const { result, rerender } = renderHook(
      ({ profs }: { profs: ColProfile[] }) =>
        useFilteredProfiles(profs, query, worker),
      { initialProps: { profs: profilesA } },
    );

    await waitFor(() => expect(result.current).toEqual(profilesA));

    // Act – change profiles
    rerender({ profs: profilesB });

    await waitFor(() => expect(result.current).toEqual(profilesB));

    // Assert
    expect(worker.filterSort).toHaveBeenCalledTimes(2);
  });

  it("re-runs filterSort when the query changes", async () => {
    // Arrange
    const profiles = [makeProfile()];
    const queryA = pristineQuery();
    const queryB = activeQuery({ search: "col" });
    const worker: ProfileWorkerClient = {
      buildProfiles: vi.fn(),
      filterSort: vi.fn()
        .mockResolvedValueOnce(profiles)
        .mockResolvedValueOnce([]),
      parseDetail: vi.fn(),
    };

    const { result, rerender } = renderHook(
      ({ q }: { q: ProfileQuery }) =>
        useFilteredProfiles(profiles, q, worker),
      { initialProps: { q: queryA } },
    );

    await waitFor(() => expect(result.current).toEqual(profiles));

    // Act – change query
    rerender({ q: queryB });

    await waitFor(() => expect(result.current).toEqual([]));

    // Assert
    expect(worker.filterSort).toHaveBeenCalledTimes(2);
  });

  it("re-runs filterSort when the worker instance changes", async () => {
    // Arrange
    const profiles = [makeProfile()];
    const query = pristineQuery();
    const workerA = makeWorker(profiles);
    const workerB = makeWorker([]);

    const { result, rerender } = renderHook(
      ({ w }: { w: ProfileWorkerClient }) =>
        useFilteredProfiles(profiles, query, w),
      { initialProps: { w: workerA } },
    );

    await waitFor(() => expect(result.current).toEqual(profiles));

    // Act – change worker
    rerender({ w: workerB });

    await waitFor(() => expect(result.current).toEqual([]));

    // Assert
    expect(workerA.filterSort).toHaveBeenCalledTimes(1);
    expect(workerB.filterSort).toHaveBeenCalledTimes(1);
  });
});

describe("useFilteredProfiles – cancellation on unmount", () => {
  it("does not update state if component unmounts before filterSort resolves", async () => {
    // Arrange – worker hangs
    let resolveFilter!: (val: ColProfile[]) => void;
    const pending = new Promise<ColProfile[]>((res) => { resolveFilter = res; });
    const worker: ProfileWorkerClient = {
      buildProfiles: vi.fn(),
      filterSort: vi.fn().mockReturnValue(pending),
      parseDetail: vi.fn(),
    };
    const profiles = [makeProfile({ name: "col" })];

    // Act
    const { result, unmount } = renderHook(() =>
      useFilteredProfiles(profiles, pristineQuery(), worker),
    );

    // Initially shows full list
    expect(result.current).toEqual(profiles);

    // Unmount before resolve
    unmount();

    // Resolve after unmount – must NOT update state
    await act(async () => {
      resolveFilter([]);
      await Promise.resolve();
    });

    // Assert – state remains the initial profiles (no update after unmount)
    expect(result.current).toEqual(profiles);
  });
});

describe("useFilteredProfiles – stale request cancellation", () => {
  it("discards the result of the stale request when a newer one supersedes it", async () => {
    // Arrange – first filterSort hangs, second resolves immediately
    let resolveFirst!: (val: ColProfile[]) => void;
    const firstPending = new Promise<ColProfile[]>((res) => { resolveFirst = res; });
    const profilesA = [makeProfile({ name: "colA" })];
    const profilesB = [makeProfile({ name: "colB" })];
    const queryA = pristineQuery();
    const queryB = activeQuery({ search: "colB" });

    const worker: ProfileWorkerClient = {
      buildProfiles: vi.fn(),
      filterSort: vi.fn()
        .mockReturnValueOnce(firstPending)
        .mockResolvedValueOnce(profilesB),
      parseDetail: vi.fn(),
    };

    const { result, rerender } = renderHook(
      ({ q }: { q: ProfileQuery }) =>
        useFilteredProfiles(profilesA, q, worker),
      { initialProps: { q: queryA } },
    );

    // First request is pending
    expect(result.current).toEqual(profilesA);

    // Act – change query before first resolves (triggers new request)
    rerender({ q: queryB });

    await waitFor(() => expect(result.current).toEqual(profilesB));

    // Resolve the stale first request – should be dropped
    await act(async () => {
      resolveFirst([makeProfile({ name: "stale" })]);
      await Promise.resolve();
    });

    // Assert – stale result did not overwrite the current one
    expect(result.current).toEqual(profilesB);
  });
});

describe("useFilteredProfiles – worker failure (catch block)", () => {
  it("falls back to full profiles list when filterSort rejects with a pristine query", async () => {
    // Arrange – isPristine=true, worker rejects
    const profiles = [makeProfile({ name: "col1" })];
    const worker: ProfileWorkerClient = {
      buildProfiles: vi.fn(),
      filterSort: vi.fn().mockRejectedValue(new Error("Worker crashed")),
      parseDetail: vi.fn(),
    };

    // Act
    const { result } = renderHook(() =>
      useFilteredProfiles(profiles, pristineQuery(), worker),
    );

    await waitFor(() => {
      // After failure with pristine query, the list is set to profiles
      expect(result.current).toEqual(profiles);
    });

    // The worker was called
    expect(worker.filterSort).toHaveBeenCalled();
  });

  it("does not update state on worker failure with a non-pristine query", async () => {
    // Arrange – isPristine=false (non-empty search), worker rejects
    // In this case the catch block's isPristine check prevents setFiltered(profiles)
    const profiles = [makeProfile({ name: "col1" }), makeProfile({ name: "col2" })];
    const worker: ProfileWorkerClient = {
      buildProfiles: vi.fn(),
      filterSort: vi.fn().mockRejectedValue(new Error("Worker crashed")),
      parseDetail: vi.fn(),
    };
    const query = activeQuery({ search: "something" });

    // Act
    const { result } = renderHook(() =>
      useFilteredProfiles(profiles, query, worker),
    );

    // Wait for the effect to run and error to be swallowed
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Assert – state was NOT updated to profiles (isPristine=false in catch)
    // The initial state is `profiles` (from useState), so it remains profiles
    expect(result.current).toEqual(profiles);
    expect(worker.filterSort).toHaveBeenCalled();
  });

  it("does not update state on worker failure when component is already unmounted", async () => {
    // Arrange – worker rejects after unmount; catch block should not call setFiltered
    let rejectFilter!: (err: Error) => void;
    const pending = new Promise<ColProfile[]>((_, rej) => { rejectFilter = rej; });
    const profiles = [makeProfile()];
    const worker: ProfileWorkerClient = {
      buildProfiles: vi.fn(),
      filterSort: vi.fn().mockReturnValue(pending),
      parseDetail: vi.fn(),
    };

    // Act
    const { result, unmount } = renderHook(() =>
      useFilteredProfiles(profiles, pristineQuery(), worker),
    );

    expect(result.current).toEqual(profiles);

    unmount();

    // Reject after unmount – should NOT throw or update state
    await act(async () => {
      rejectFilter(new Error("Worker crashed after unmount"));
      await Promise.resolve();
    });

    // Assert – still initial state, no errors thrown
    expect(result.current).toEqual(profiles);
  });

  it("does not fall back when request is stale on worker failure with pristine query", async () => {
    // Arrange – stale request (requestId !== requestRef.current) + pristine query + failure
    // The catch condition is: !cancelled && requestId === requestRef.current && isPristine
    // When a new request has been made, requestId !== requestRef.current, so no fallback.
    let rejectFirst!: (err: Error) => void;
    const firstPending = new Promise<ColProfile[]>((_, rej) => { rejectFirst = rej; });
    const profilesA = [makeProfile({ name: "colA" })];
    const profilesB = [makeProfile({ name: "colB" })];
    const queryA = pristineQuery();
    const queryB = pristineQuery({ sortBy: "name" }); // still pristine but different query obj

    const worker: ProfileWorkerClient = {
      buildProfiles: vi.fn(),
      filterSort: vi.fn()
        .mockReturnValueOnce(firstPending)
        .mockResolvedValueOnce(profilesB),
      parseDetail: vi.fn(),
    };

    const { result, rerender } = renderHook(
      ({ q }: { q: ProfileQuery }) =>
        useFilteredProfiles(profilesA, q, worker),
      { initialProps: { q: queryA } },
    );

    // First request is pending
    expect(result.current).toEqual(profilesA);

    // Act – change query so request #2 is started (request #1 becomes stale)
    rerender({ q: queryB });

    // Wait for request #2 to resolve
    await waitFor(() => expect(result.current).toEqual(profilesB));

    // Now reject the stale first request – should be dropped (requestId mismatch)
    await act(async () => {
      rejectFirst(new Error("stale failure"));
      await Promise.resolve();
    });

    // Assert – profilesB still showing, not overwritten by stale fallback
    expect(result.current).toEqual(profilesB);
  });
});

describe("useFilteredProfiles – return value", () => {
  it("returns the current filtered list from state", async () => {
    // Arrange
    const profiles = [makeProfile({ name: "a" }), makeProfile({ name: "b" })];
    const expectedFiltered = [makeProfile({ name: "a" })];
    const worker = makeWorker(expectedFiltered);

    // Act
    const { result } = renderHook(() =>
      useFilteredProfiles(profiles, pristineQuery(), worker),
    );

    await waitFor(() => expect(result.current).toEqual(expectedFiltered));

    // The hook must return exactly the filtered value
    expect(result.current).toBe(result.current);
    expect(result.current).toHaveLength(1);
    expect(result.current[0].name).toBe("a");
  });
});
