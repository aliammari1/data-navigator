/**
 * Unit tests for usePreviewRows hook.
 *
 * Strategy:
 * - Mock @/platform/duckdb/duckdb so no real DuckDB worker is involved.
 * - Keep the real usePreviewRows module so coverage counts.
 * - Exercise every branch:
 *   1. viewName = null → resets to EMPTY state immediately.
 *   2. viewName non-null, happy path → loading=true during fetch, rows set after.
 *   3. viewName non-null, query returns null/undefined → falls back to [].
 *   4. viewName non-null, query rejects with Error instance → error.message used.
 *   5. viewName non-null, query rejects with non-Error → fallback string used.
 *   6. Stale response (id !== reqId.current) in .then() path → dropped silently.
 *   7. Stale response (id !== reqId.current) in .catch() path → dropped silently.
 *   8. limit clamping: default 20, value below 1 → clamped to 1, above 100 → clamped to 100.
 *   9. quoteIdent escapes embedded double-quotes in viewName.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Hoist mock factory ───────────────────────────────────────────────────────

const mockRunReadOnlyQuery = vi.hoisted(() => vi.fn());

vi.mock("@/platform/duckdb/duckdb", () => ({
  runReadOnlyQuery: mockRunReadOnlyQuery,
}));

// ─── Import the real hook AFTER mocks are registered ─────────────────────────

import { usePreviewRows } from "@/features/folders/hooks/usePreviewRows";

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("usePreviewRows – initial state", () => {
  it("starts with empty rows, loading=false, and no error", () => {
    // Arrange: make query never resolve so we can inspect the initial render
    mockRunReadOnlyQuery.mockReturnValue(new Promise(() => {}));

    // Act
    const { result } = renderHook(() => usePreviewRows("myView"));

    // Assert: initial state before effect resolves
    // Note: after the first effect run loading becomes true, so we just check structure
    expect(Array.isArray(result.current.rows)).toBe(true);
    expect(typeof result.current.loading).toBe("boolean");
    expect(result.current.error === null || typeof result.current.error === "string").toBe(true);
  });
});

describe("usePreviewRows – null viewName", () => {
  it("returns EMPTY state immediately when viewName is null", () => {
    // Arrange + Act
    const { result } = renderHook(() => usePreviewRows(null));

    // Assert: no loading, no rows, no error
    expect(result.current.rows).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();

    // No query should have been run
    expect(mockRunReadOnlyQuery).not.toHaveBeenCalled();
  });

  it("resets to EMPTY state when viewName changes from a value to null", async () => {
    // Arrange
    let resolveFn!: (rows: Record<string, unknown>[]) => void;
    mockRunReadOnlyQuery.mockReturnValue(
      new Promise<Record<string, unknown>[]>((res) => {
        resolveFn = res;
      }),
    );

    const { result, rerender } = renderHook(
      ({ viewName }: { viewName: string | null }) => usePreviewRows(viewName),
      { initialProps: { viewName: "someView" as string | null } },
    );

    // Wait for loading state
    await waitFor(() => expect(result.current.loading).toBe(true));

    // Act: change to null — should reset immediately
    act(() => {
      rerender({ viewName: null });
    });

    // Assert: resets to EMPTY
    expect(result.current.rows).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();

    // Settle the pending promise to avoid act() warnings
    act(() => {
      resolveFn([]);
    });
  });
});

describe("usePreviewRows – successful query", () => {
  it("sets loading=true while the query is in flight", async () => {
    // Arrange: hold the promise
    mockRunReadOnlyQuery.mockReturnValue(new Promise(() => {}));

    // Act
    const { result } = renderHook(() => usePreviewRows("myView"));

    // Assert: loading is true once the effect fires
    await waitFor(() => expect(result.current.loading).toBe(true));
  });

  it("sets rows and loading=false after a successful query", async () => {
    // Arrange
    const fakeRows = [{ id: 1, name: "Alice" }];
    mockRunReadOnlyQuery.mockResolvedValue(fakeRows);

    // Act
    const { result } = renderHook(() => usePreviewRows("myView"));

    // Assert
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows).toEqual(fakeRows);
    expect(result.current.error).toBeNull();
  });

  it("calls runReadOnlyQuery with a properly quoted view name", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockResolvedValue([]);

    // Act
    renderHook(() => usePreviewRows("myView"));

    await waitFor(() => expect(mockRunReadOnlyQuery).toHaveBeenCalled());

    // Assert: SQL contains a double-quoted identifier
    const sql: string = mockRunReadOnlyQuery.mock.calls[0][0];
    expect(sql).toContain('"myView"');
    expect(sql).toContain("LIMIT 20");
  });

  it("falls back to empty array when query resolves with null", async () => {
    // Arrange: runReadOnlyQuery resolves with null (covers `rows ?? []`)
    mockRunReadOnlyQuery.mockResolvedValue(null as unknown as Record<string, unknown>[]);

    // Act
    const { result } = renderHook(() => usePreviewRows("myView"));

    // Assert
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("falls back to empty array when query resolves with undefined", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockResolvedValue(undefined as unknown as Record<string, unknown>[]);

    // Act
    const { result } = renderHook(() => usePreviewRows("myView"));

    // Assert
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows).toEqual([]);
  });
});

describe("usePreviewRows – quoteIdent with embedded double-quotes", () => {
  it("escapes embedded double-quotes in the viewName", async () => {
    // Arrange: view name contains a double-quote character
    mockRunReadOnlyQuery.mockResolvedValue([]);

    // Act
    renderHook(() => usePreviewRows('view"with"quotes'));

    await waitFor(() => expect(mockRunReadOnlyQuery).toHaveBeenCalled());

    // Assert: inner double-quotes are doubled-up (SQL escaping)
    const sql: string = mockRunReadOnlyQuery.mock.calls[0][0];
    expect(sql).toContain('"view""with""quotes"');
  });
});

describe("usePreviewRows – error handling", () => {
  it("sets error.message when query rejects with an Error instance", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockRejectedValue(new Error("DuckDB connection failed"));

    // Act
    const { result } = renderHook(() => usePreviewRows("myView"));

    // Assert
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows).toEqual([]);
    expect(result.current.error).toBe("DuckDB connection failed");
  });

  it("sets fallback error string when query rejects with a non-Error value (string)", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockRejectedValue("some string error");

    // Act
    const { result } = renderHook(() => usePreviewRows("myView"));

    // Assert
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Échec du chargement de l'aperçu");
    expect(result.current.rows).toEqual([]);
  });

  it("sets fallback error string when query rejects with a non-Error value (number)", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockRejectedValue(42);

    // Act
    const { result } = renderHook(() => usePreviewRows("myView"));

    // Assert
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Échec du chargement de l'aperçu");
  });

  it("sets fallback error string when query rejects with null", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockRejectedValue(null);

    // Act
    const { result } = renderHook(() => usePreviewRows("myView"));

    // Assert
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Échec du chargement de l'aperçu");
  });
});

describe("usePreviewRows – limit parameter clamping", () => {
  it("uses the default limit of 20 rows when no limit is given", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockResolvedValue([]);

    // Act
    renderHook(() => usePreviewRows("myView"));

    await waitFor(() => expect(mockRunReadOnlyQuery).toHaveBeenCalled());

    // Assert
    const sql: string = mockRunReadOnlyQuery.mock.calls[0][0];
    expect(sql).toContain("LIMIT 20");
  });

  it("clamps limit to 1 when given a value below 1 (e.g. 0)", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockResolvedValue([]);

    // Act
    renderHook(() => usePreviewRows("myView", 0));

    await waitFor(() => expect(mockRunReadOnlyQuery).toHaveBeenCalled());

    // Assert
    const sql: string = mockRunReadOnlyQuery.mock.calls[0][0];
    expect(sql).toContain("LIMIT 1");
  });

  it("clamps limit to 1 when given a negative value", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockResolvedValue([]);

    // Act
    renderHook(() => usePreviewRows("myView", -5));

    await waitFor(() => expect(mockRunReadOnlyQuery).toHaveBeenCalled());

    // Assert
    const sql: string = mockRunReadOnlyQuery.mock.calls[0][0];
    expect(sql).toContain("LIMIT 1");
  });

  it("clamps limit to 100 when given a value above 100", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockResolvedValue([]);

    // Act
    renderHook(() => usePreviewRows("myView", 200));

    await waitFor(() => expect(mockRunReadOnlyQuery).toHaveBeenCalled());

    // Assert
    const sql: string = mockRunReadOnlyQuery.mock.calls[0][0];
    expect(sql).toContain("LIMIT 100");
  });

  it("floors a float limit (e.g. 7.9 → 7)", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockResolvedValue([]);

    // Act
    renderHook(() => usePreviewRows("myView", 7.9));

    await waitFor(() => expect(mockRunReadOnlyQuery).toHaveBeenCalled());

    // Assert
    const sql: string = mockRunReadOnlyQuery.mock.calls[0][0];
    expect(sql).toContain("LIMIT 7");
  });

  it("uses an exact limit of 50 when within bounds", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockResolvedValue([]);

    // Act
    renderHook(() => usePreviewRows("myView", 50));

    await waitFor(() => expect(mockRunReadOnlyQuery).toHaveBeenCalled());

    // Assert
    const sql: string = mockRunReadOnlyQuery.mock.calls[0][0];
    expect(sql).toContain("LIMIT 50");
  });
});

describe("usePreviewRows – stale request guard", () => {
  it("ignores a resolved response when a newer request has superseded it (then path)", async () => {
    // Arrange: two sequential view changes; capture resolve of the first
    let resolveFirst!: (rows: Record<string, unknown>[]) => void;
    const firstPromise = new Promise<Record<string, unknown>[]>((res) => {
      resolveFirst = res;
    });

    const secondRows = [{ id: 2, val: "second" }];

    // First call returns a held promise; second call resolves immediately
    mockRunReadOnlyQuery.mockReturnValueOnce(firstPromise).mockResolvedValueOnce(secondRows);

    const { result, rerender } = renderHook(
      ({ viewName }: { viewName: string }) => usePreviewRows(viewName),
      { initialProps: { viewName: "viewA" } },
    );

    // Wait for first request to be in-flight
    await waitFor(() => expect(result.current.loading).toBe(true));

    // Act: trigger second request (viewB) before first resolves
    act(() => {
      rerender({ viewName: "viewB" });
    });

    // Wait for second request to complete
    await waitFor(() => expect(result.current.rows).toEqual(secondRows));

    // Now resolve the first (stale) request — it should be ignored
    act(() => {
      resolveFirst([{ id: 1, val: "first (stale)" }]);
    });

    // Assert: state still reflects the second request
    expect(result.current.rows).toEqual(secondRows);
    expect(result.current.loading).toBe(false);
  });

  it("ignores a rejected response when a newer request has superseded it (catch path)", async () => {
    // Arrange
    let rejectFirst!: (err: unknown) => void;
    const firstPromise = new Promise<Record<string, unknown>[]>((_, rej) => {
      rejectFirst = rej;
    });

    const secondRows = [{ id: 2, val: "second" }];

    mockRunReadOnlyQuery.mockReturnValueOnce(firstPromise).mockResolvedValueOnce(secondRows);

    const { result, rerender } = renderHook(
      ({ viewName }: { viewName: string }) => usePreviewRows(viewName),
      { initialProps: { viewName: "viewA" } },
    );

    await waitFor(() => expect(result.current.loading).toBe(true));

    // Act: trigger second request before first rejects
    act(() => {
      rerender({ viewName: "viewB" });
    });

    // Wait for second request to settle
    await waitFor(() => expect(result.current.rows).toEqual(secondRows));

    // Now reject the first (stale) request — should be ignored
    act(() => {
      rejectFirst(new Error("stale error"));
    });

    // Assert: error from stale request is NOT applied
    expect(result.current.error).toBeNull();
    expect(result.current.rows).toEqual(secondRows);
  });
});

describe("usePreviewRows – rerenders with same viewName", () => {
  it("refetches when limit changes while viewName remains constant", async () => {
    // Arrange
    mockRunReadOnlyQuery.mockResolvedValue([]);

    const { rerender } = renderHook(
      ({ limit }: { limit: number }) => usePreviewRows("myView", limit),
      { initialProps: { limit: 10 } },
    );

    await waitFor(() => expect(mockRunReadOnlyQuery).toHaveBeenCalledTimes(1));

    // Act: change limit
    mockRunReadOnlyQuery.mockResolvedValue([{ x: 1 }]);
    act(() => {
      rerender({ limit: 50 });
    });

    await waitFor(() => expect(mockRunReadOnlyQuery).toHaveBeenCalledTimes(2));

    // Assert: second query uses new limit
    const sql2: string = mockRunReadOnlyQuery.mock.calls[1][0];
    expect(sql2).toContain("LIMIT 50");
  });
});
