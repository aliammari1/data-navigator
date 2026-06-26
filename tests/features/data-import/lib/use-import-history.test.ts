/**
 * Tests for useImportHistory hook.
 *
 * Strategy:
 * - Mock @/platform/electron/electron-fs so no real Electron bridge is touched.
 * - Exercise both sides of isElectron() (true/false), success/error paths of
 *   listDatasets(), and toHistoryEntry field mapping.
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoist mocks before module resolution ─────────────────────────────────────

const mockIsElectron = vi.fn<() => boolean>();
const mockListDatasets = vi.fn();

vi.mock("@/platform/electron/electron-fs", () => ({
  isElectron: () => mockIsElectron(),
  listDatasets: () => mockListDatasets(),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { useImportHistory } from "@/features/data-import/lib/use-import-history";
import type { RegisteredDataset } from "@/platform/electron/electron-fs";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDataset(overrides: Partial<RegisteredDataset> = {}): RegisteredDataset {
  return {
    id: "ds-1",
    displayName: "Sales Data",
    viewName: "sales_view",
    sourcePath: "/data/sales.csv",
    cachePath: "/cache/sales.parquet",
    sourceFormat: "csv",
    rowCount: 1000,
    columns: [
      { name: "id", type: "INTEGER", nullable: false },
      { name: "amount", type: "DOUBLE", nullable: true },
    ],
    createdAt: "2026-01-01T10:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useImportHistory – non-Electron environment", () => {
  it("returns empty history, not loading, no error when isElectron() is false", async () => {
    // Arrange
    mockIsElectron.mockReturnValue(false);

    // Act
    const { result } = renderHook(() => useImportHistory());

    // Assert — the hook fires the effect immediately; wait for it to settle
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.history).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(mockListDatasets).not.toHaveBeenCalled();
  });

  it("manual refresh in non-Electron env also sets empty history and returns", async () => {
    // Arrange
    mockIsElectron.mockReturnValue(false);

    const { result } = renderHook(() => useImportHistory());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Act — call refresh manually
    await act(async () => {
      await result.current.refresh();
    });

    // Assert
    expect(result.current.history).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(mockListDatasets).not.toHaveBeenCalled();
  });
});

describe("useImportHistory – happy path (Electron env)", () => {
  it("loads datasets, maps them to history entries, and sorts by createdAt descending", async () => {
    // Arrange
    mockIsElectron.mockReturnValue(true);

    const dataset1 = makeDataset({
      id: "ds-1",
      displayName: "Older",
      rowCount: 100,
      columns: [{ name: "col1", type: "VARCHAR", nullable: true }],
      sourceFormat: "csv",
      createdAt: "2026-01-01T00:00:00Z",
    });
    const dataset2 = makeDataset({
      id: "ds-2",
      displayName: "Newer",
      rowCount: 500,
      columns: [
        { name: "col1", type: "INTEGER", nullable: false },
        { name: "col2", type: "DOUBLE", nullable: true },
      ],
      sourceFormat: "parquet",
      createdAt: "2026-06-01T00:00:00Z",
    });

    mockListDatasets.mockResolvedValue([dataset1, dataset2]);

    // Act
    const { result } = renderHook(() => useImportHistory());

    // Initially loading should start (may be true right after mount)
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert — sorted descending: newer first
    expect(result.current.history).toHaveLength(2);
    expect(result.current.history[0].id).toBe("ds-2");
    expect(result.current.history[1].id).toBe("ds-1");
    expect(result.current.error).toBeNull();
  });

  it("maps all fields of toHistoryEntry correctly", async () => {
    // Arrange
    mockIsElectron.mockReturnValue(true);

    const dataset = makeDataset({
      id: "ds-abc",
      displayName: "My Dataset",
      rowCount: 999,
      columns: [
        { name: "a", type: "VARCHAR", nullable: false },
        { name: "b", type: "INTEGER", nullable: true },
        { name: "c", type: "DOUBLE", nullable: true },
      ],
      sourceFormat: "parquet",
      createdAt: "2026-03-15T12:00:00Z",
    });

    mockListDatasets.mockResolvedValue([dataset]);

    // Act
    const { result } = renderHook(() => useImportHistory());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert field mapping
    const entry = result.current.history[0];
    expect(entry.id).toBe("ds-abc");
    expect(entry.name).toBe("My Dataset");
    expect(entry.rows).toBe(999);
    expect(entry.cols).toBe(3); // columns.length
    expect(entry.format).toBe("parquet");
    expect(entry.createdAt).toBe("2026-03-15T12:00:00Z");
  });

  it("sets loading to true during fetch and false after completion", async () => {
    // Arrange
    mockIsElectron.mockReturnValue(true);

    let resolveDatasets!: (datasets: RegisteredDataset[]) => void;
    const pending = new Promise<RegisteredDataset[]>((res) => {
      resolveDatasets = res;
    });
    mockListDatasets.mockReturnValue(pending);

    // Act
    const { result } = renderHook(() => useImportHistory());

    // Loading should be true while the promise is pending
    expect(result.current.loading).toBe(true);

    // Resolve the promise
    await act(async () => {
      resolveDatasets([]);
    });

    // Assert
    expect(result.current.loading).toBe(false);
    expect(result.current.history).toEqual([]);
  });

  it("returns empty history when listDatasets resolves with an empty array", async () => {
    // Arrange
    mockIsElectron.mockReturnValue(true);
    mockListDatasets.mockResolvedValue([]);

    // Act
    const { result } = renderHook(() => useImportHistory());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert
    expect(result.current.history).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("manual refresh re-fetches datasets", async () => {
    // Arrange
    mockIsElectron.mockReturnValue(true);

    const dataset = makeDataset({ id: "ds-fresh", displayName: "Fresh" });
    mockListDatasets.mockResolvedValue([]);

    const { result } = renderHook(() => useImportHistory());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.history).toHaveLength(0);

    // Update mock for refresh
    mockListDatasets.mockResolvedValue([dataset]);

    // Act — manually refresh
    await act(async () => {
      await result.current.refresh();
    });

    // Assert
    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].id).toBe("ds-fresh");
    expect(mockListDatasets).toHaveBeenCalledTimes(2); // initial + refresh
  });

  it("clears a previous error on successful refresh", async () => {
    // Arrange — first call fails, second succeeds
    mockIsElectron.mockReturnValue(true);
    mockListDatasets.mockRejectedValueOnce(new Error("first failure"));

    const { result } = renderHook(() => useImportHistory());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("first failure");

    const dataset = makeDataset();
    mockListDatasets.mockResolvedValue([dataset]);

    // Act — refresh to clear error
    await act(async () => {
      await result.current.refresh();
    });

    // Assert
    expect(result.current.error).toBeNull();
    expect(result.current.history).toHaveLength(1);
  });
});

describe("useImportHistory – error handling", () => {
  it("captures an Error instance message when listDatasets rejects with an Error", async () => {
    // Arrange
    mockIsElectron.mockReturnValue(true);
    mockListDatasets.mockRejectedValue(new Error("bridge unavailable"));

    // Act
    const { result } = renderHook(() => useImportHistory());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert
    expect(result.current.error).toBe("bridge unavailable");
    expect(result.current.history).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("converts a non-Error rejection to a string via String(cause)", async () => {
    // Arrange
    mockIsElectron.mockReturnValue(true);
    mockListDatasets.mockRejectedValue("raw string error");

    // Act
    const { result } = renderHook(() => useImportHistory());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert
    expect(result.current.error).toBe("raw string error");
    expect(result.current.history).toEqual([]);
  });

  it("converts a numeric rejection to a string via String(cause)", async () => {
    // Arrange
    mockIsElectron.mockReturnValue(true);
    mockListDatasets.mockRejectedValue(42);

    // Act
    const { result } = renderHook(() => useImportHistory());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert
    expect(result.current.error).toBe("42");
  });

  it("sets loading to false in finally even when listDatasets throws", async () => {
    // Arrange
    mockIsElectron.mockReturnValue(true);
    mockListDatasets.mockRejectedValue(new Error("network error"));

    // Act
    const { result } = renderHook(() => useImportHistory());

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe("network error");
  });
});

describe("useImportHistory – sort order edge cases", () => {
  it("sorts a single entry without error", async () => {
    // Arrange
    mockIsElectron.mockReturnValue(true);

    const single = makeDataset({ createdAt: "2026-06-01T00:00:00Z" });
    mockListDatasets.mockResolvedValue([single]);

    // Act
    const { result } = renderHook(() => useImportHistory());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert
    expect(result.current.history).toHaveLength(1);
  });

  it("sorts three entries in descending createdAt order", async () => {
    // Arrange
    mockIsElectron.mockReturnValue(true);

    const ds1 = makeDataset({ id: "a", createdAt: "2026-01-01T00:00:00Z" });
    const ds2 = makeDataset({ id: "b", createdAt: "2026-03-01T00:00:00Z" });
    const ds3 = makeDataset({ id: "c", createdAt: "2026-06-01T00:00:00Z" });

    // Provide in unsorted order
    mockListDatasets.mockResolvedValue([ds2, ds1, ds3]);

    // Act
    const { result } = renderHook(() => useImportHistory());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert — descending order
    expect(result.current.history.map((h) => h.id)).toEqual(["c", "b", "a"]);
  });
});
