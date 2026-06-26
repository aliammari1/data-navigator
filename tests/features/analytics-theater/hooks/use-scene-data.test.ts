/**
 * Tests for useSceneData hook.
 *
 * Strategy:
 * - Mock @/core/queries/duckdb (useDuckDBQuery) and
 *   @/features/analytics-theater/lib/use-active-dataset (useActiveDataset)
 *   so no real DuckDB, React Query, or store wiring runs.
 * - Keep the real useSceneData logic intact so every line/branch counts.
 *
 * Branches covered:
 *   1. useMemo: (ready && view) ? builder(view, roles) : null
 *      a. ready=false → null
 *      b. view=null   → null
 *      c. ready=true and view non-null → builder called; result may be null or SceneSql
 *   2. built?.sql ?? ""  (null → "", non-null → sql string)
 *   3. enabled: Boolean(built)
 *   4. built?.note ?? null  (null → null, non-null → string)
 *   5. unsupported: !built
 *   6. isEmpty: Boolean(built) && !isLoading && !error && data.length === 0
 *      all four sub-branches exercised
 *   7. refetch: () => void refetch()  — wrapper is callable
 */

import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks must be declared before importing the target ──────────────────────

const mockUseDuckDBQuery = vi.fn();
const mockUseActiveDataset = vi.fn();

vi.mock("@/core/queries/duckdb", () => ({
  useDuckDBQuery: (...args: unknown[]) => mockUseDuckDBQuery(...args),
}));

vi.mock("@/features/analytics-theater/lib/use-active-dataset", () => ({
  useActiveDataset: () => mockUseActiveDataset(),
}));

// ─── Import the real target after mocks ──────────────────────────────────────

import { useSceneData } from "@/features/analytics-theater/hooks/use-scene-data";
import type { ColumnRoles } from "@/features/analytics-theater/lib/columns";
import type { SceneSql } from "@/features/analytics-theater/lib/queries";

// ─── Fixture helpers ──────────────────────────────────────────────────────────

const EMPTY_ROLES: ColumnRoles = {
  date: null,
  measure: null,
  category: null,
  category2: null,
  text: null,
  numeric: [],
  strings: [],
};

function makeActiveDataset(overrides: Partial<{
  view: string | null;
  roles: ColumnRoles;
  ready: boolean;
}> = {}) {
  return {
    datasetId: "ds-1",
    name: "Test Dataset",
    view: "test_view",
    rowCount: 100,
    roles: EMPTY_ROLES,
    ready: true,
    ...overrides,
  };
}

function makeQueryResult(overrides: Partial<{
  data: Record<string, unknown>[];
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
}> = {}) {
  return {
    data: [],
    isLoading: false,
    error: undefined,
    refetch: vi.fn(),
    ...overrides,
  };
}

const SCENE_SQL: SceneSql = { sql: "SELECT 1", note: "test note" };

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Safe defaults — tests override as needed
  mockUseActiveDataset.mockReturnValue(makeActiveDataset());
  mockUseDuckDBQuery.mockReturnValue(makeQueryResult());
});

// ─── useMemo branch: ready=false → built=null ─────────────────────────────────

describe("useSceneData – useMemo short-circuits when not ready", () => {
  it("does not call builder when ready=false", () => {
    mockUseActiveDataset.mockReturnValue(makeActiveDataset({ ready: false, view: "test_view" }));
    mockUseDuckDBQuery.mockReturnValue(makeQueryResult());
    const builder = vi.fn(() => SCENE_SQL);

    const { result } = renderHook(() => useSceneData(builder));

    expect(builder).not.toHaveBeenCalled();
    expect(result.current.unsupported).toBe(true);
    expect(result.current.note).toBeNull();
  });

  it("passes empty string sql and enabled=false when built=null", () => {
    mockUseActiveDataset.mockReturnValue(makeActiveDataset({ ready: false, view: "test_view" }));
    mockUseDuckDBQuery.mockReturnValue(makeQueryResult());
    const builder = vi.fn(() => SCENE_SQL);

    renderHook(() => useSceneData(builder));

    // useDuckDBQuery should have been called with "" and enabled=false
    const [sql, , opts] = mockUseDuckDBQuery.mock.calls[0];
    expect(sql).toBe("");
    expect(opts.enabled).toBe(false);
  });
});

// ─── useMemo branch: view=null → built=null ───────────────────────────────────

describe("useSceneData – useMemo short-circuits when view=null", () => {
  it("does not call builder when view is null", () => {
    mockUseActiveDataset.mockReturnValue(makeActiveDataset({ ready: true, view: null }));
    mockUseDuckDBQuery.mockReturnValue(makeQueryResult());
    const builder = vi.fn(() => SCENE_SQL);

    const { result } = renderHook(() => useSceneData(builder));

    expect(builder).not.toHaveBeenCalled();
    expect(result.current.unsupported).toBe(true);
    expect(result.current.view).toBeNull();
  });
});

// ─── useMemo branch: ready && view → builder called ──────────────────────────

describe("useSceneData – builder is called when ready and view is set", () => {
  it("calls builder with view and roles and passes sql to useDuckDBQuery", () => {
    const roles = { ...EMPTY_ROLES };
    mockUseActiveDataset.mockReturnValue(makeActiveDataset({ ready: true, view: "my_view", roles }));
    mockUseDuckDBQuery.mockReturnValue(makeQueryResult());
    const builder = vi.fn((_view: string, _roles: ColumnRoles) => SCENE_SQL);

    renderHook(() => useSceneData(builder));

    expect(builder).toHaveBeenCalledWith("my_view", roles);
    const [sql, params, opts] = mockUseDuckDBQuery.mock.calls[0];
    expect(sql).toBe("SELECT 1");
    expect(params).toEqual(["my_view"]);
    expect(opts.enabled).toBe(true);
  });

  it("passes null note and unsupported=true when builder returns null", () => {
    mockUseActiveDataset.mockReturnValue(makeActiveDataset({ ready: true, view: "my_view" }));
    mockUseDuckDBQuery.mockReturnValue(makeQueryResult());
    const builder = vi.fn(() => null);

    const { result } = renderHook(() => useSceneData(builder));

    expect(result.current.note).toBeNull();
    expect(result.current.unsupported).toBe(true);
  });

  it("returns note from built.note when builder returns SceneSql", () => {
    mockUseActiveDataset.mockReturnValue(makeActiveDataset({ ready: true, view: "my_view" }));
    mockUseDuckDBQuery.mockReturnValue(makeQueryResult());
    const builder = vi.fn(() => SCENE_SQL);

    const { result } = renderHook(() => useSceneData(builder));

    expect(result.current.note).toBe("test note");
    expect(result.current.unsupported).toBe(false);
  });
});

// ─── rows and data passthrough ────────────────────────────────────────────────

describe("useSceneData – rows passthrough from useDuckDBQuery", () => {
  it("rows equals data returned from useDuckDBQuery", () => {
    mockUseActiveDataset.mockReturnValue(makeActiveDataset());
    const rows = [{ col: "a" }, { col: "b" }];
    mockUseDuckDBQuery.mockReturnValue(makeQueryResult({ data: rows }));
    const builder = vi.fn(() => SCENE_SQL);

    const { result } = renderHook(() => useSceneData(builder));

    expect(result.current.rows).toEqual(rows);
  });

  it("rows defaults to [] when data is undefined (default param)", () => {
    mockUseActiveDataset.mockReturnValue(makeActiveDataset());
    // Return result without data property to trigger the default = []
    mockUseDuckDBQuery.mockReturnValue({
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    });
    const builder = vi.fn(() => SCENE_SQL);

    const { result } = renderHook(() => useSceneData(builder));

    expect(result.current.rows).toEqual([]);
  });
});

// ─── isLoading and error passthrough ─────────────────────────────────────────

describe("useSceneData – isLoading and error from useDuckDBQuery", () => {
  it("isLoading=true is passed through", () => {
    mockUseActiveDataset.mockReturnValue(makeActiveDataset());
    mockUseDuckDBQuery.mockReturnValue(makeQueryResult({ isLoading: true }));
    const builder = vi.fn(() => SCENE_SQL);

    const { result } = renderHook(() => useSceneData(builder));

    expect(result.current.isLoading).toBe(true);
  });

  it("isLoading=false is passed through", () => {
    mockUseActiveDataset.mockReturnValue(makeActiveDataset());
    mockUseDuckDBQuery.mockReturnValue(makeQueryResult({ isLoading: false }));
    const builder = vi.fn(() => SCENE_SQL);

    const { result } = renderHook(() => useSceneData(builder));

    expect(result.current.isLoading).toBe(false);
  });

  it("error is passed through", () => {
    const err = new Error("DuckDB boom");
    mockUseActiveDataset.mockReturnValue(makeActiveDataset());
    mockUseDuckDBQuery.mockReturnValue(makeQueryResult({ error: err }));
    const builder = vi.fn(() => SCENE_SQL);

    const { result } = renderHook(() => useSceneData(builder));

    expect(result.current.error).toBe(err);
  });
});

// ─── isEmpty branch coverage ──────────────────────────────────────────────────

describe("useSceneData – isEmpty covers all sub-branches", () => {
  it("isEmpty=true when built is non-null, not loading, no error, data is empty", () => {
    mockUseActiveDataset.mockReturnValue(makeActiveDataset({ ready: true, view: "v" }));
    mockUseDuckDBQuery.mockReturnValue(makeQueryResult({ data: [], isLoading: false, error: undefined }));
    const builder = vi.fn(() => SCENE_SQL);

    const { result } = renderHook(() => useSceneData(builder));

    expect(result.current.isEmpty).toBe(true);
  });

  it("isEmpty=false when built is null (unsupported scene)", () => {
    mockUseActiveDataset.mockReturnValue(makeActiveDataset({ ready: false, view: null }));
    mockUseDuckDBQuery.mockReturnValue(makeQueryResult({ data: [], isLoading: false, error: undefined }));
    const builder = vi.fn(() => null);

    const { result } = renderHook(() => useSceneData(builder));

    expect(result.current.isEmpty).toBe(false);
  });

  it("isEmpty=false when isLoading=true even with empty data", () => {
    mockUseActiveDataset.mockReturnValue(makeActiveDataset({ ready: true, view: "v" }));
    mockUseDuckDBQuery.mockReturnValue(makeQueryResult({ data: [], isLoading: true, error: undefined }));
    const builder = vi.fn(() => SCENE_SQL);

    const { result } = renderHook(() => useSceneData(builder));

    expect(result.current.isEmpty).toBe(false);
  });

  it("isEmpty=false when error is set even with empty data", () => {
    mockUseActiveDataset.mockReturnValue(makeActiveDataset({ ready: true, view: "v" }));
    mockUseDuckDBQuery.mockReturnValue(makeQueryResult({ data: [], isLoading: false, error: new Error("err") }));
    const builder = vi.fn(() => SCENE_SQL);

    const { result } = renderHook(() => useSceneData(builder));

    expect(result.current.isEmpty).toBe(false);
  });

  it("isEmpty=false when data has rows", () => {
    mockUseActiveDataset.mockReturnValue(makeActiveDataset({ ready: true, view: "v" }));
    mockUseDuckDBQuery.mockReturnValue(makeQueryResult({ data: [{ x: 1 }], isLoading: false, error: undefined }));
    const builder = vi.fn(() => SCENE_SQL);

    const { result } = renderHook(() => useSceneData(builder));

    expect(result.current.isEmpty).toBe(false);
  });

  it("isEmpty=false when builder returns null (unsupported) even with empty data and no loading/error", () => {
    mockUseActiveDataset.mockReturnValue(makeActiveDataset({ ready: true, view: "v" }));
    mockUseDuckDBQuery.mockReturnValue(makeQueryResult({ data: [], isLoading: false, error: undefined }));
    const builder = vi.fn(() => null);

    const { result } = renderHook(() => useSceneData(builder));

    // built is null → Boolean(built) is false → isEmpty is false
    expect(result.current.isEmpty).toBe(false);
    expect(result.current.unsupported).toBe(true);
  });
});

// ─── refetch wrapper ──────────────────────────────────────────────────────────

describe("useSceneData – refetch wrapper", () => {
  it("refetch is a function", () => {
    mockUseActiveDataset.mockReturnValue(makeActiveDataset());
    const mockRefetch = vi.fn().mockResolvedValue(undefined);
    mockUseDuckDBQuery.mockReturnValue(makeQueryResult({ refetch: mockRefetch }));
    const builder = vi.fn(() => SCENE_SQL);

    const { result } = renderHook(() => useSceneData(builder));

    expect(typeof result.current.refetch).toBe("function");
  });

  it("calling refetch delegates to the underlying refetch from useDuckDBQuery", () => {
    mockUseActiveDataset.mockReturnValue(makeActiveDataset());
    const mockRefetch = vi.fn().mockResolvedValue(undefined);
    mockUseDuckDBQuery.mockReturnValue(makeQueryResult({ refetch: mockRefetch }));
    const builder = vi.fn(() => SCENE_SQL);

    const { result } = renderHook(() => useSceneData(builder));
    result.current.refetch();

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("refetch return value is void (discards the promise)", () => {
    mockUseActiveDataset.mockReturnValue(makeActiveDataset());
    const mockRefetch = vi.fn().mockResolvedValue({ data: [] });
    mockUseDuckDBQuery.mockReturnValue(makeQueryResult({ refetch: mockRefetch }));
    const builder = vi.fn(() => SCENE_SQL);

    const { result } = renderHook(() => useSceneData(builder));
    const ret = result.current.refetch();

    // The wrapper uses `void refetch()` so the return is undefined
    expect(ret).toBeUndefined();
  });
});

// ─── roles and view passthrough ───────────────────────────────────────────────

describe("useSceneData – roles and view passthrough from useActiveDataset", () => {
  it("exposes roles from the active dataset context", () => {
    const roles: ColumnRoles = { ...EMPTY_ROLES };
    mockUseActiveDataset.mockReturnValue(makeActiveDataset({ roles }));
    mockUseDuckDBQuery.mockReturnValue(makeQueryResult());
    const builder = vi.fn(() => SCENE_SQL);

    const { result } = renderHook(() => useSceneData(builder));

    expect(result.current.roles).toBe(roles);
  });

  it("exposes view from the active dataset context", () => {
    mockUseActiveDataset.mockReturnValue(makeActiveDataset({ view: "my_view" }));
    mockUseDuckDBQuery.mockReturnValue(makeQueryResult());
    const builder = vi.fn(() => SCENE_SQL);

    const { result } = renderHook(() => useSceneData(builder));

    expect(result.current.view).toBe("my_view");
  });

  it("exposes null view when no view is available", () => {
    mockUseActiveDataset.mockReturnValue(makeActiveDataset({ ready: true, view: null }));
    mockUseDuckDBQuery.mockReturnValue(makeQueryResult());
    const builder = vi.fn(() => null);

    const { result } = renderHook(() => useSceneData(builder));

    expect(result.current.view).toBeNull();
  });
});

// ─── useDuckDBQuery key parameters ───────────────────────────────────────────

describe("useSceneData – useDuckDBQuery call parameters", () => {
  it("passes [view] as the params array for cache keying", () => {
    mockUseActiveDataset.mockReturnValue(makeActiveDataset({ ready: true, view: "key_view" }));
    mockUseDuckDBQuery.mockReturnValue(makeQueryResult());
    const builder = vi.fn(() => SCENE_SQL);

    renderHook(() => useSceneData(builder));

    const [, params] = mockUseDuckDBQuery.mock.calls[0];
    expect(params).toEqual(["key_view"]);
  });

  it("passes enabled=false when built is null (builder returns null)", () => {
    mockUseActiveDataset.mockReturnValue(makeActiveDataset({ ready: true, view: "v" }));
    mockUseDuckDBQuery.mockReturnValue(makeQueryResult());
    const builder = vi.fn(() => null);

    renderHook(() => useSceneData(builder));

    const [, , opts] = mockUseDuckDBQuery.mock.calls[0];
    expect(opts.enabled).toBe(false);
  });

  it("passes null view as params when there is no active view", () => {
    mockUseActiveDataset.mockReturnValue(makeActiveDataset({ ready: false, view: null }));
    mockUseDuckDBQuery.mockReturnValue(makeQueryResult());
    const builder = vi.fn(() => null);

    renderHook(() => useSceneData(builder));

    const [, params] = mockUseDuckDBQuery.mock.calls[0];
    expect(params).toEqual([null]);
  });
});
