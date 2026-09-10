/**
 * Unit tests for useFolderNodes hook.
 *
 * Strategy:
 * - Mock @/core/stores/data-store and @/core/stores/folders-store so no
 *   real Zustand persistence or DuckDB is needed.
 * - Keep the real useFolderNodes module so coverage counts.
 * - Exercise every branch: empty stores, populated stores, parentId nullish
 *   coalescing, datasetFolderMap lookup fallback, starred set membership.
 */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Hoist mutable store state refs ──────────────────────────────────────────

const mockDatasetsRef = vi.hoisted(() => ({
  value: [] as Array<{
    id: string;
    name: string;
    format: string;
    sizeBytes: number;
    rowCount: number;
    colCount: number;
    createdAt: string;
    updatedAt: string;
    tags: string[];
    qualityScore: number;
    description: string;
  }>,
}));

const mockCatalogFoldersRef = vi.hoisted(() => ({
  value: [] as Array<{
    id: string;
    name: string;
    parentId: string | null;
    starred: boolean;
    color?: string;
    createdAt: string;
  }>,
}));

const mockDatasetFolderMapRef = vi.hoisted(() => ({
  value: {} as Record<string, string | null>,
}));

const mockStarredDatasetsRef = vi.hoisted(() => ({
  value: [] as string[],
}));

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/core/stores/data-store", () => ({
  useDataStore: vi.fn((selector: (s: { datasets: typeof mockDatasetsRef.value }) => unknown) =>
    selector({ datasets: mockDatasetsRef.value }),
  ),
}));

vi.mock("@/core/stores/folders-store", () => ({
  useFoldersStore: vi.fn(
    (
      selector: (s: {
        folders: typeof mockCatalogFoldersRef.value;
        datasetFolderMap: typeof mockDatasetFolderMapRef.value;
        starredDatasets: typeof mockStarredDatasetsRef.value;
      }) => unknown,
    ) =>
      selector({
        folders: mockCatalogFoldersRef.value,
        datasetFolderMap: mockDatasetFolderMapRef.value,
        starredDatasets: mockStarredDatasetsRef.value,
      }),
  ),
}));

// ─── Import AFTER mocks ───────────────────────────────────────────────────────

import { useFolderNodes } from "@/features/folders/hooks/use-folder-nodes";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDataset(
  over: Partial<(typeof mockDatasetsRef.value)[0]> & { id: string } = { id: "ds-1" },
) {
  return {
    id: "ds-1",
    name: "Sales Data",
    format: "csv",
    sizeBytes: 1024,
    rowCount: 100,
    colCount: 5,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-06-01T00:00:00.000Z",
    tags: ["finance"],
    qualityScore: 80,
    description: "Sales dataset",
    ...over,
  };
}

function makeFolder(
  over: Partial<(typeof mockCatalogFoldersRef.value)[0]> & { id: string } = { id: "folder-1" },
) {
  return {
    id: "folder-1",
    name: "Finance",
    parentId: null,
    starred: false,
    color: "#2f6bff",
    createdAt: "2024-01-01T00:00:00.000Z",
    ...over,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockDatasetsRef.value = [];
  mockCatalogFoldersRef.value = [];
  mockDatasetFolderMapRef.value = {};
  mockStarredDatasetsRef.value = [];
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useFolderNodes – empty stores", () => {
  it("returns only the synthetic root node when all stores are empty", () => {
    // Arrange: all stores empty (default beforeEach state)

    // Act
    const { result } = renderHook(() => useFolderNodes());

    // Assert
    expect(result.current).toHaveLength(1);
    const [root] = result.current;
    expect(root.id).toBe("root");
    expect(root.name).toBe("My Datasets");
    expect(root.type).toBe("folder");
    expect(root.parentId).toBeNull();
    expect(root.size).toBe(0);
    expect(root.starred).toBe(false);
    expect(root.color).toBe("#1E40AF");
    expect(root.tags).toEqual([]);
  });

  it("root node createdAt is epoch (new Date(0))", () => {
    // Act
    const { result } = renderHook(() => useFolderNodes());

    // Assert
    const [root] = result.current;
    expect(root.createdAt.getTime()).toBe(0);
  });

  it("root node updatedAt is a recent Date (not epoch)", () => {
    // Act
    const { result } = renderHook(() => useFolderNodes());

    // Assert
    const [root] = result.current;
    expect(root.updatedAt.getTime()).toBeGreaterThan(0);
  });
});

describe("useFolderNodes – folder nodes", () => {
  it("maps a catalog folder with null parentId to ROOT_ID ('root')", () => {
    // Arrange: folder with parentId = null
    mockCatalogFoldersRef.value = [makeFolder({ id: "f1", parentId: null })];

    // Act
    const { result } = renderHook(() => useFolderNodes());

    // Assert: folder parentId defaults to 'root'
    const folderNode = result.current.find((n) => n.id === "f1");
    expect(folderNode).toBeDefined();
    expect(folderNode?.parentId).toBe("root");
  });

  it("maps a catalog folder with an explicit parentId to that parentId", () => {
    // Arrange: folder with parentId = 'parent-folder'
    mockCatalogFoldersRef.value = [makeFolder({ id: "f2", parentId: "parent-folder" })];

    // Act
    const { result } = renderHook(() => useFolderNodes());

    // Assert: parentId is preserved (not overridden by ROOT_ID)
    const folderNode = result.current.find((n) => n.id === "f2");
    expect(folderNode?.parentId).toBe("parent-folder");
  });

  it("maps all folder fields correctly", () => {
    // Arrange
    mockCatalogFoldersRef.value = [
      makeFolder({
        id: "f3",
        name: "Analytics",
        parentId: null,
        starred: true,
        color: "#ff0000",
        createdAt: "2024-03-15T10:00:00.000Z",
      }),
    ];

    // Act
    const { result } = renderHook(() => useFolderNodes());

    // Assert
    const node = result.current.find((n) => n.id === "f3");
    expect(node?.name).toBe("Analytics");
    expect(node?.type).toBe("folder");
    expect(node?.size).toBe(0);
    expect(node?.starred).toBe(true);
    expect(node?.color).toBe("#ff0000");
    expect(node?.createdAt).toEqual(new Date("2024-03-15T10:00:00.000Z"));
    expect(node?.updatedAt).toEqual(new Date("2024-03-15T10:00:00.000Z"));
    expect(node?.tags).toEqual([]);
  });

  it("maps multiple folders preserving order", () => {
    // Arrange
    mockCatalogFoldersRef.value = [
      makeFolder({ id: "f-a", name: "Alpha", parentId: null }),
      makeFolder({ id: "f-b", name: "Beta", parentId: "f-a" }),
    ];

    // Act
    const { result } = renderHook(() => useFolderNodes());

    // Assert: root first, then folders in order
    const ids = result.current.map((n) => n.id);
    expect(ids[0]).toBe("root");
    expect(ids[1]).toBe("f-a");
    expect(ids[2]).toBe("f-b");
  });

  it("maps a folder without a color field (color is undefined)", () => {
    // Arrange
    const folder = makeFolder({ id: "f-nocolor", color: undefined });
    mockCatalogFoldersRef.value = [folder];

    // Act
    const { result } = renderHook(() => useFolderNodes());

    // Assert: color is undefined
    const node = result.current.find((n) => n.id === "f-nocolor");
    expect(node?.color).toBeUndefined();
  });
});

describe("useFolderNodes – file/dataset nodes", () => {
  it("maps a dataset not in the folder map to parentId='root'", () => {
    // Arrange: dataset not in datasetFolderMap at all
    mockDatasetsRef.value = [makeDataset({ id: "ds-1" })];
    mockDatasetFolderMapRef.value = {};

    // Act
    const { result } = renderHook(() => useFolderNodes());

    // Assert
    const node = result.current.find((n) => n.id === "ds-1");
    expect(node?.parentId).toBe("root");
  });

  it("maps a dataset in the folder map to the folder's id", () => {
    // Arrange: dataset mapped to a specific folder
    mockDatasetsRef.value = [makeDataset({ id: "ds-2" })];
    mockDatasetFolderMapRef.value = { "ds-2": "folder-x" };

    // Act
    const { result } = renderHook(() => useFolderNodes());

    // Assert
    const node = result.current.find((n) => n.id === "ds-2");
    expect(node?.parentId).toBe("folder-x");
  });

  it("maps a dataset with a null folder map entry to parentId='root'", () => {
    // Arrange: explicit null in map means root
    mockDatasetsRef.value = [makeDataset({ id: "ds-3" })];
    mockDatasetFolderMapRef.value = { "ds-3": null };

    // Act
    const { result } = renderHook(() => useFolderNodes());

    // Assert: null falls through ?? to 'root'
    const node = result.current.find((n) => n.id === "ds-3");
    expect(node?.parentId).toBe("root");
  });

  it("marks a dataset as starred when its id is in starredDatasets", () => {
    // Arrange
    mockDatasetsRef.value = [makeDataset({ id: "ds-star" })];
    mockStarredDatasetsRef.value = ["ds-star"];

    // Act
    const { result } = renderHook(() => useFolderNodes());

    // Assert
    const node = result.current.find((n) => n.id === "ds-star");
    expect(node?.starred).toBe(true);
  });

  it("marks a dataset as not starred when its id is NOT in starredDatasets", () => {
    // Arrange
    mockDatasetsRef.value = [makeDataset({ id: "ds-nostar" })];
    mockStarredDatasetsRef.value = ["ds-other"];

    // Act
    const { result } = renderHook(() => useFolderNodes());

    // Assert
    const node = result.current.find((n) => n.id === "ds-nostar");
    expect(node?.starred).toBe(false);
  });

  it("maps all dataset fields correctly", () => {
    // Arrange
    mockDatasetsRef.value = [
      makeDataset({
        id: "ds-full",
        name: "Full Dataset",
        format: "parquet",
        sizeBytes: 5120,
        rowCount: 200,
        colCount: 8,
        createdAt: "2024-02-10T00:00:00.000Z",
        updatedAt: "2024-05-20T00:00:00.000Z",
        tags: ["tag1", "tag2"],
        qualityScore: 90,
        description: "Full dataset description",
      }),
    ];
    mockDatasetFolderMapRef.value = { "ds-full": "folder-y" };
    mockStarredDatasetsRef.value = ["ds-full"];

    // Act
    const { result } = renderHook(() => useFolderNodes());

    // Assert
    const node = result.current.find((n) => n.id === "ds-full");
    expect(node?.name).toBe("Full Dataset");
    expect(node?.type).toBe("parquet");
    expect(node?.parentId).toBe("folder-y");
    expect(node?.size).toBe(5120);
    expect(node?.rowCount).toBe(200);
    expect(node?.colCount).toBe(8);
    expect(node?.createdAt).toEqual(new Date("2024-02-10T00:00:00.000Z"));
    expect(node?.updatedAt).toEqual(new Date("2024-05-20T00:00:00.000Z"));
    expect(node?.tags).toEqual(["tag1", "tag2"]);
    expect(node?.starred).toBe(true);
    expect(node?.quality).toBeCloseTo(0.9);
    expect(node?.description).toBe("Full dataset description");
  });

  it("quality is computed as qualityScore / 100", () => {
    // Arrange
    mockDatasetsRef.value = [makeDataset({ id: "ds-q", qualityScore: 75 })];

    // Act
    const { result } = renderHook(() => useFolderNodes());

    // Assert
    const node = result.current.find((n) => n.id === "ds-q");
    expect(node?.quality).toBeCloseTo(0.75);
  });

  it("maps multiple datasets preserving order after folders", () => {
    // Arrange
    mockCatalogFoldersRef.value = [makeFolder({ id: "f1" })];
    mockDatasetsRef.value = [
      makeDataset({ id: "ds-a", name: "Alpha" }),
      makeDataset({ id: "ds-b", name: "Beta" }),
    ];

    // Act
    const { result } = renderHook(() => useFolderNodes());

    // Assert: root, folder, then datasets in order
    const ids = result.current.map((n) => n.id);
    expect(ids).toEqual(["root", "f1", "ds-a", "ds-b"]);
  });
});

describe("useFolderNodes – combined stores", () => {
  it("returns [root, ...folderNodes, ...fileNodes] in the correct order", () => {
    // Arrange
    mockCatalogFoldersRef.value = [
      makeFolder({ id: "folder-1", parentId: null }),
      makeFolder({ id: "folder-2", parentId: "folder-1" }),
    ];
    mockDatasetsRef.value = [makeDataset({ id: "ds-1" }), makeDataset({ id: "ds-2" })];
    mockDatasetFolderMapRef.value = { "ds-1": "folder-1", "ds-2": null };
    mockStarredDatasetsRef.value = ["ds-2"];

    // Act
    const { result } = renderHook(() => useFolderNodes());

    // Assert
    expect(result.current).toHaveLength(5); // root + 2 folders + 2 datasets
    expect(result.current[0].id).toBe("root");
    expect(result.current[1].id).toBe("folder-1");
    expect(result.current[2].id).toBe("folder-2");
    expect(result.current[3].id).toBe("ds-1");
    expect(result.current[4].id).toBe("ds-2");

    // folder-2 nested under folder-1
    expect(result.current[2].parentId).toBe("folder-1");
    // ds-1 in folder-1
    expect(result.current[3].parentId).toBe("folder-1");
    // ds-2 with null map → root
    expect(result.current[4].parentId).toBe("root");
    // ds-2 is starred
    expect(result.current[4].starred).toBe(true);
    // ds-1 is not starred
    expect(result.current[3].starred).toBe(false);
  });

  it("handles a mix of starred and unstarred datasets correctly", () => {
    // Arrange
    mockDatasetsRef.value = [
      makeDataset({ id: "ds-starred-1" }),
      makeDataset({ id: "ds-starred-2" }),
      makeDataset({ id: "ds-unstarred" }),
    ];
    mockStarredDatasetsRef.value = ["ds-starred-1", "ds-starred-2"];

    // Act
    const { result } = renderHook(() => useFolderNodes());

    // Assert
    const starred1 = result.current.find((n) => n.id === "ds-starred-1");
    const starred2 = result.current.find((n) => n.id === "ds-starred-2");
    const unstarred = result.current.find((n) => n.id === "ds-unstarred");

    expect(starred1?.starred).toBe(true);
    expect(starred2?.starred).toBe(true);
    expect(unstarred?.starred).toBe(false);
  });

  it("uses the correct format/type for different dataset formats", () => {
    // Arrange
    mockDatasetsRef.value = [
      makeDataset({ id: "ds-csv", format: "csv" }),
      makeDataset({ id: "ds-parquet", format: "parquet" }),
      makeDataset({ id: "ds-json", format: "json" }),
      makeDataset({ id: "ds-excel", format: "excel" }),
    ];

    // Act
    const { result } = renderHook(() => useFolderNodes());

    // Assert
    expect(result.current.find((n) => n.id === "ds-csv")?.type).toBe("csv");
    expect(result.current.find((n) => n.id === "ds-parquet")?.type).toBe("parquet");
    expect(result.current.find((n) => n.id === "ds-json")?.type).toBe("json");
    expect(result.current.find((n) => n.id === "ds-excel")?.type).toBe("excel");
  });
});

describe("useFolderNodes – memoization", () => {
  it("returns the same array reference when stores do not change", () => {
    // Arrange
    mockDatasetsRef.value = [makeDataset({ id: "ds-memo" })];
    mockCatalogFoldersRef.value = [makeFolder({ id: "f-memo" })];

    // Act: render twice
    const { result, rerender } = renderHook(() => useFolderNodes());
    const firstRef = result.current;
    rerender();

    // Assert: same reference (useMemo not recomputed)
    expect(result.current).toBe(firstRef);
  });
});
