import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useBriefingContext } from "@/features/ai-briefing/hooks/useBriefingContext";

/**
 * Behavioral suite for useBriefingContext.
 *
 * Two external boundaries are mocked:
 *   - `@/core/stores/data-store` (useDataStore) — controlled via a module-level
 *     selector fn so each test can inject whatever dataset/id it needs.
 *   - `@/features/ai-briefing/core/briefing-context` (buildBriefingContext) —
 *     returns a controllable promise per test.
 *
 * Everything inside the hook (state machine, race-condition guard via reqRef,
 * memo derivation of activeDataset, effect keyed off datasetId) runs for real.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

// We keep a mutable state object that `useDataStore` selector draws from so
// individual tests can swap datasets without re-importing the module.
let storeState = {
  datasets: [] as Array<{
    id: string;
    name: string;
    tableName: string;
    viewName: string;
    rowCount: number;
    columns: unknown[];
  }>,
  activeDatasetId: null as string | null,
};

vi.mock("@/core/stores/data-store", () => ({
  useDataStore: (selector: (s: typeof storeState) => unknown) => selector(storeState),
}));

const buildBriefingContext = vi.fn();
vi.mock("@/features/ai-briefing/core/briefing-context", () => ({
  buildBriefingContext: (...args: unknown[]) => buildBriefingContext(...args),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDataset(overrides: Partial<{
  id: string;
  name: string;
  tableName: string;
  viewName: string;
  rowCount: number;
  columns: unknown[];
}> = {}) {
  return {
    id: "ds_001",
    name: "Test Dataset",
    tableName: "ds_001_table",
    viewName: "ds_001_view",
    rowCount: 100,
    columns: [],
    ...overrides,
  };
}

function makeBriefingContext(overrides: Record<string, unknown> = {}) {
  return {
    datasetId: "ds_001",
    datasetName: "Test Dataset",
    tableName: "ds_001_view",
    rowCount: 100,
    generatedAt: new Date().toISOString(),
    numericCols: [],
    topCategory: null,
    ...overrides,
  };
}

beforeEach(() => {
  // Reset store to empty state before each test.
  storeState = {
    datasets: [],
    activeDatasetId: null,
  };
  buildBriefingContext.mockReset();
});

// ─── No active dataset ────────────────────────────────────────────────────────

describe("useBriefingContext: no active dataset", () => {
  it("returns null context and false loading when no datasets exist", () => {
    // Arrange: store is empty, no activeDatasetId
    storeState.datasets = [];
    storeState.activeDatasetId = null;

    // Act
    const { result } = renderHook(() => useBriefingContext());

    // Assert: initial state when there is nothing to load
    expect(result.current.context).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.hasDataset).toBe(false);
    expect(result.current.datasetName).toBeNull();
  });

  it("does not call buildBriefingContext when there is no active dataset", () => {
    // Arrange
    storeState.datasets = [];
    storeState.activeDatasetId = null;

    // Act
    renderHook(() => useBriefingContext());

    // Assert
    expect(buildBriefingContext).not.toHaveBeenCalled();
  });

  it("returns null context when activeDatasetId does not match any dataset", () => {
    // Arrange: id mismatch — dataset exists but activeDatasetId points elsewhere
    storeState.datasets = [makeDataset({ id: "ds_001" })];
    storeState.activeDatasetId = "ds_999"; // no match

    // Act
    const { result } = renderHook(() => useBriefingContext());

    // Assert
    expect(result.current.context).toBeNull();
    expect(result.current.hasDataset).toBe(false);
    expect(result.current.datasetName).toBeNull();
    expect(buildBriefingContext).not.toHaveBeenCalled();
  });
});

// ─── Happy path: context loads successfully ───────────────────────────────────

describe("useBriefingContext: successful load", () => {
  it("sets loading=true during fetch, then resolves context and loading=false", async () => {
    // Arrange
    const dataset = makeDataset();
    storeState.datasets = [dataset];
    storeState.activeDatasetId = dataset.id;

    let resolveCtx!: (v: unknown) => void;
    const pendingCtx = new Promise((res) => { resolveCtx = res; });
    buildBriefingContext.mockReturnValue(pendingCtx);

    // Act: mount — the effect fires synchronously then awaits the promise
    const { result } = renderHook(() => useBriefingContext());

    // After mount but before promise resolves: loading should be true
    await waitFor(() => expect(result.current.loading).toBe(true));

    // Resolve the context
    const ctx = makeBriefingContext();
    await act(async () => { resolveCtx(ctx); });

    // Assert: loading cleared, context populated
    expect(result.current.loading).toBe(false);
    expect(result.current.context).toBe(ctx);
    expect(result.current.error).toBeNull();
  });

  it("exposes hasDataset=true and datasetName when active dataset is set", async () => {
    // Arrange
    const dataset = makeDataset({ id: "ds_abc", name: "Sales Data" });
    storeState.datasets = [dataset];
    storeState.activeDatasetId = dataset.id;
    buildBriefingContext.mockResolvedValue(makeBriefingContext({ datasetName: "Sales Data" }));

    // Act
    const { result } = renderHook(() => useBriefingContext());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert
    expect(result.current.hasDataset).toBe(true);
    expect(result.current.datasetName).toBe("Sales Data");
  });

  it("calls buildBriefingContext with the active dataset object", async () => {
    // Arrange
    const dataset = makeDataset({ id: "ds_xyz" });
    storeState.datasets = [dataset];
    storeState.activeDatasetId = dataset.id;
    buildBriefingContext.mockResolvedValue(makeBriefingContext());

    // Act
    const { result } = renderHook(() => useBriefingContext());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert: the hook passes the full dataset object
    expect(buildBriefingContext).toHaveBeenCalledWith(dataset);
  });

  it("returns a reload function that re-runs buildBriefingContext", async () => {
    // Arrange
    const dataset = makeDataset();
    storeState.datasets = [dataset];
    storeState.activeDatasetId = dataset.id;
    const ctx = makeBriefingContext();
    buildBriefingContext.mockResolvedValue(ctx);

    const { result } = renderHook(() => useBriefingContext());
    await waitFor(() => expect(result.current.loading).toBe(false));

    buildBriefingContext.mockClear();
    const updatedCtx = makeBriefingContext({ rowCount: 999 });
    buildBriefingContext.mockResolvedValue(updatedCtx);

    // Act: manually trigger reload
    await act(async () => { await result.current.reload(); });

    // Assert: reload called buildBriefingContext again
    expect(buildBriefingContext).toHaveBeenCalledTimes(1);
    expect(result.current.context).toBe(updatedCtx);
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe("useBriefingContext: error handling", () => {
  it("captures the error message when buildBriefingContext throws an Error", async () => {
    // Arrange
    const dataset = makeDataset();
    storeState.datasets = [dataset];
    storeState.activeDatasetId = dataset.id;
    buildBriefingContext.mockRejectedValue(new Error("DuckDB unavailable"));

    // Act
    const { result } = renderHook(() => useBriefingContext());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert: error is surfaced, context stays null
    expect(result.current.error).toBe("DuckDB unavailable");
    expect(result.current.context).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("uses the fallback message when a non-Error is thrown", async () => {
    // Arrange
    const dataset = makeDataset();
    storeState.datasets = [dataset];
    storeState.activeDatasetId = dataset.id;
    // Throw a plain string, not an Error instance.
    buildBriefingContext.mockRejectedValue("unexpected string error");

    // Act
    const { result } = renderHook(() => useBriefingContext());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert: fallback message used
    expect(result.current.error).toBe("Could not read the active dataset.");
    expect(result.current.context).toBeNull();
  });

  it("clears a previous error when reload succeeds", async () => {
    // Arrange: first call fails
    const dataset = makeDataset();
    storeState.datasets = [dataset];
    storeState.activeDatasetId = dataset.id;
    buildBriefingContext.mockRejectedValueOnce(new Error("transient failure"));

    const { result } = renderHook(() => useBriefingContext());
    await waitFor(() => expect(result.current.error).toBe("transient failure"));

    // Now the next call succeeds
    const ctx = makeBriefingContext();
    buildBriefingContext.mockResolvedValue(ctx);

    // Act: reload
    await act(async () => { await result.current.reload(); });

    // Assert: error cleared, context populated
    expect(result.current.error).toBeNull();
    expect(result.current.context).toBe(ctx);
  });

  it("clears a previous error when dataset is removed (no active dataset)", async () => {
    // Arrange: first mount with a failing dataset
    const dataset = makeDataset();
    storeState.datasets = [dataset];
    storeState.activeDatasetId = dataset.id;
    buildBriefingContext.mockRejectedValue(new Error("bad data"));

    const { result, rerender } = renderHook(() => useBriefingContext());
    await waitFor(() => expect(result.current.error).toBe("bad data"));

    // Act: remove the active dataset
    storeState.datasets = [];
    storeState.activeDatasetId = null;
    rerender();

    // After reload fires (triggered by datasetId change from "ds_001" → null)
    await waitFor(() => expect(result.current.error).toBeNull());

    // Assert: back to idle state
    expect(result.current.context).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.hasDataset).toBe(false);
  });
});

// ─── Dataset switching ────────────────────────────────────────────────────────

describe("useBriefingContext: dataset switching", () => {
  it("re-fetches context when the active dataset id changes", async () => {
    // Arrange: first dataset
    const ds1 = makeDataset({ id: "ds_001", name: "Dataset One" });
    const ds2 = makeDataset({ id: "ds_002", name: "Dataset Two" });
    storeState.datasets = [ds1, ds2];
    storeState.activeDatasetId = ds1.id;
    const ctx1 = makeBriefingContext({ datasetId: "ds_001" });
    const ctx2 = makeBriefingContext({ datasetId: "ds_002" });
    buildBriefingContext.mockResolvedValueOnce(ctx1).mockResolvedValueOnce(ctx2);

    const { result, rerender } = renderHook(() => useBriefingContext());
    await waitFor(() => expect(result.current.context).toBe(ctx1));

    // Act: switch active dataset
    storeState.activeDatasetId = ds2.id;
    rerender();

    await waitFor(() => expect(result.current.context).toBe(ctx2));

    // Assert: called twice (once per dataset switch)
    expect(buildBriefingContext).toHaveBeenCalledTimes(2);
    expect(buildBriefingContext).toHaveBeenNthCalledWith(1, ds1);
    expect(buildBriefingContext).toHaveBeenNthCalledWith(2, ds2);
  });

  it("resets to null context when active dataset is cleared", async () => {
    // Arrange
    const dataset = makeDataset();
    storeState.datasets = [dataset];
    storeState.activeDatasetId = dataset.id;
    buildBriefingContext.mockResolvedValue(makeBriefingContext());

    const { result, rerender } = renderHook(() => useBriefingContext());
    await waitFor(() => expect(result.current.context).not.toBeNull());

    // Act: clear active dataset
    storeState.activeDatasetId = null;
    rerender();

    // Assert: hook resets to idle state
    await waitFor(() => expect(result.current.context).toBeNull());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.hasDataset).toBe(false);
  });

  it("does not re-fetch when unrelated store properties change but datasetId stays the same", async () => {
    // Arrange
    const dataset = makeDataset({ id: "ds_001" });
    storeState.datasets = [dataset];
    storeState.activeDatasetId = dataset.id;
    buildBriefingContext.mockResolvedValue(makeBriefingContext());

    const { result, rerender } = renderHook(() => useBriefingContext());
    await waitFor(() => expect(result.current.loading).toBe(false));

    buildBriefingContext.mockClear();

    // Act: add an unrelated dataset (doesn't change the active id)
    storeState.datasets = [dataset, makeDataset({ id: "ds_unrelated" })];
    rerender();

    // Small tick to let any potential effect fire
    await act(async () => {});

    // Assert: no additional fetch because datasetId is still "ds_001"
    expect(buildBriefingContext).not.toHaveBeenCalled();
  });
});

// ─── Race condition guard ─────────────────────────────────────────────────────

describe("useBriefingContext: race condition (stale request cancellation)", () => {
  it("ignores the result of a stale request when a newer one resolves first", async () => {
    // Arrange: two slow requests where the second resolves before the first
    const ds1 = makeDataset({ id: "ds_001", name: "First" });
    const ds2 = makeDataset({ id: "ds_002", name: "Second" });
    storeState.datasets = [ds1, ds2];
    storeState.activeDatasetId = ds1.id;

    let resolveFirst!: (v: unknown) => void;
    let resolveSecond!: (v: unknown) => void;
    const pendingFirst = new Promise((res) => { resolveFirst = res; });
    const pendingSecond = new Promise((res) => { resolveSecond = res; });

    buildBriefingContext
      .mockReturnValueOnce(pendingFirst)
      .mockReturnValueOnce(pendingSecond);

    const { result, rerender } = renderHook(() => useBriefingContext());

    // First request is in-flight
    await waitFor(() => expect(buildBriefingContext).toHaveBeenCalledTimes(1));

    // Switch to ds2 — triggers a second request (reqId = 2)
    storeState.activeDatasetId = ds2.id;
    rerender();
    await waitFor(() => expect(buildBriefingContext).toHaveBeenCalledTimes(2));

    const ctx2 = makeBriefingContext({ datasetId: "ds_002" });
    const ctx1 = makeBriefingContext({ datasetId: "ds_001" });

    // Resolve second (newer) first, then resolve first (stale)
    await act(async () => { resolveSecond(ctx2); });
    await waitFor(() => expect(result.current.context).toBe(ctx2));

    // Now resolve the stale first request — it should be ignored
    await act(async () => { resolveFirst(ctx1); });

    // Context should remain the second (newer) one, not overwritten by the stale one
    expect(result.current.context).toBe(ctx2);
    expect(result.current.context?.datasetId).toBe("ds_002");
  });
});

// ─── Return value shape ───────────────────────────────────────────────────────

describe("useBriefingContext: return value shape", () => {
  it("returns all six expected fields on initial render", () => {
    // Arrange
    storeState.datasets = [];
    storeState.activeDatasetId = null;

    // Act
    const { result } = renderHook(() => useBriefingContext());

    // Assert: all fields present with correct types
    const state = result.current;
    expect(typeof state.context).toBe("object"); // null is object
    expect(typeof state.loading).toBe("boolean");
    expect(typeof state.error).toBe("object"); // null is object
    expect(typeof state.hasDataset).toBe("boolean");
    expect(typeof state.datasetName).toBe("object"); // null is object
    expect(typeof state.reload).toBe("function");
  });

  it("keeps the reload function stable across re-renders when dataset does not change", async () => {
    // Arrange
    const dataset = makeDataset();
    storeState.datasets = [dataset];
    storeState.activeDatasetId = dataset.id;
    buildBriefingContext.mockResolvedValue(makeBriefingContext());

    const { result, rerender } = renderHook(() => useBriefingContext());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const firstReload = result.current.reload;

    // Act: re-render without changing anything
    rerender();

    // Assert: reload is the same reference (useCallback deps didn't change)
    expect(result.current.reload).toBe(firstReload);
  });
});
