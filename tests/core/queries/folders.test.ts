import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useFoldersStore } from "@/core/stores/folders-store";

// ─── Mock persistence boundary (no real fetch/SQLite) ─────────────────────────
vi.mock("@/platform/settings/settings-client", () => ({
  canUseSettingsApi: () => false,
  getAppSettingRemote: vi.fn(async () => ({ value: null, updatedAt: null })),
  putAppSettingRemote: vi.fn(async () => null),
  deleteAppSettingRemote: vi.fn(async () => undefined),
  exportAppSettingsRemote: vi.fn(async () => ({})),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Create a fresh QueryClient for each test to prevent cache bleed-over. */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

/** Wrap a renderHook call in a QueryClientProvider. */
function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

/** Reset Zustand store to an empty, deterministic state. */
function resetStore() {
  act(() => {
    useFoldersStore.setState({
      folders: [],
      datasetFolderMap: {},
      starredDatasets: [],
    });
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useFolders", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    resetStore();
    queryClient = makeQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
    vi.restoreAllMocks();
  });

  it("returns all folders when parentId is undefined", async () => {
    // Arrange – seed two folders at different levels
    act(() => {
      useFoldersStore.setState({
        folders: [
          { id: "a", name: "Root", parentId: null, starred: false, createdAt: new Date().toISOString() },
          { id: "b", name: "Child", parentId: "a", starred: false, createdAt: new Date().toISOString() },
        ],
        datasetFolderMap: {},
        starredDatasets: [],
      });
    });

    const { useFolders } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useFolders(undefined), {
      wrapper: makeWrapper(queryClient),
    });

    // Act / Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
  });

  it("returns only root-level folders when parentId is null", async () => {
    // Arrange
    act(() => {
      useFoldersStore.setState({
        folders: [
          { id: "a", name: "Root", parentId: null, starred: false, createdAt: new Date().toISOString() },
          { id: "b", name: "Child", parentId: "a", starred: false, createdAt: new Date().toISOString() },
        ],
        datasetFolderMap: {},
        starredDatasets: [],
      });
    });

    const { useFolders } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useFolders(null), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // parentId === null → filter(f => f.parentId === null) → only "a"
    expect(result.current.data?.map((f) => f.id)).toEqual(["a"]);
  });

  it("returns only children of the specified parentId", async () => {
    // Arrange
    act(() => {
      useFoldersStore.setState({
        folders: [
          { id: "a", name: "Root", parentId: null, starred: false, createdAt: new Date().toISOString() },
          { id: "b", name: "Child of a", parentId: "a", starred: false, createdAt: new Date().toISOString() },
          { id: "c", name: "Sibling of b", parentId: "a", starred: false, createdAt: new Date().toISOString() },
          { id: "d", name: "Other root", parentId: null, starred: false, createdAt: new Date().toISOString() },
        ],
        datasetFolderMap: {},
        starredDatasets: [],
      });
    });

    const { useFolders } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useFolders("a"), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((f) => f.id).sort()).toEqual(["b", "c"]);
  });

  it("returns an empty array when no folder matches parentId", async () => {
    // Arrange – no folders
    const { useFolders } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useFolders("missing-parent"), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useAllFolders", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    resetStore();
    queryClient = makeQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("returns all folders regardless of hierarchy", async () => {
    // Arrange
    act(() => {
      useFoldersStore.setState({
        folders: [
          { id: "x", name: "X", parentId: null, starred: false, createdAt: new Date().toISOString() },
          { id: "y", name: "Y", parentId: "x", starred: false, createdAt: new Date().toISOString() },
        ],
        datasetFolderMap: {},
        starredDatasets: [],
      });
    });

    const { useAllFolders } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useAllFolders(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.map((f) => f.id).sort()).toEqual(["x", "y"]);
  });

  it("returns an empty array when store has no folders", async () => {
    const { useAllFolders } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useAllFolders(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useFolder", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    resetStore();
    queryClient = makeQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("returns null and is not enabled when id is null", async () => {
    const { useFolder } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useFolder(null), {
      wrapper: makeWrapper(queryClient),
    });

    // enabled: !!id → false when null, so query stays pending/idle
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  it("finds and returns the folder matching the given id", async () => {
    // Arrange
    act(() => {
      useFoldersStore.setState({
        folders: [
          { id: "f1", name: "Alpha", parentId: null, starred: false, createdAt: "2024-01-01T00:00:00.000Z" },
          { id: "f2", name: "Beta", parentId: null, starred: false, createdAt: "2024-01-02T00:00:00.000Z" },
        ],
        datasetFolderMap: {},
        starredDatasets: [],
      });
    });

    const { useFolder } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useFolder("f1"), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe("f1");
    expect(result.current.data?.name).toBe("Alpha");
  });

  it("returns null when the id does not match any folder", async () => {
    // Arrange – store has folders but not the requested one
    act(() => {
      useFoldersStore.setState({
        folders: [
          { id: "f1", name: "Alpha", parentId: null, starred: false, createdAt: "2024-01-01T00:00:00.000Z" },
        ],
        datasetFolderMap: {},
        starredDatasets: [],
      });
    });

    const { useFolder } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useFolder("nonexistent"), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useDatasetFolderMap", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    resetStore();
    queryClient = makeQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("returns the full dataset-to-folder map from the store", async () => {
    // Arrange
    act(() => {
      useFoldersStore.setState({
        folders: [],
        datasetFolderMap: { ds1: "f1", ds2: null },
        starredDatasets: [],
      });
    });

    const { useDatasetFolderMap } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useDatasetFolderMap(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ ds1: "f1", ds2: null });
  });

  it("returns an empty object when the map is empty", async () => {
    const { useDatasetFolderMap } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useDatasetFolderMap(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useDatasetFolder", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    resetStore();
    queryClient = makeQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("is not enabled and returns undefined when datasetId is null", async () => {
    const { useDatasetFolder } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useDatasetFolder(null), {
      wrapper: makeWrapper(queryClient),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  it("returns the folderId for a known datasetId", async () => {
    // Arrange
    act(() => {
      useFoldersStore.setState({
        folders: [],
        datasetFolderMap: { "ds-abc": "folder-xyz" },
        starredDatasets: [],
      });
    });

    const { useDatasetFolder } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useDatasetFolder("ds-abc"), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe("folder-xyz");
  });

  it("returns null when the datasetId is not in the map", async () => {
    const { useDatasetFolder } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useDatasetFolder("unknown-ds"), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("returns null when the dataset is mapped to null (root level)", async () => {
    // Arrange
    act(() => {
      useFoldersStore.setState({
        folders: [],
        datasetFolderMap: { "ds-root": null },
        starredDatasets: [],
      });
    });

    const { useDatasetFolder } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useDatasetFolder("ds-root"), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useStarredDatasets", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    resetStore();
    queryClient = makeQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("returns the current list of starred dataset ids", async () => {
    // Arrange
    act(() => {
      useFoldersStore.setState({
        folders: [],
        datasetFolderMap: {},
        starredDatasets: ["ds1", "ds3"],
      });
    });

    const { useStarredDatasets } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useStarredDatasets(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(["ds1", "ds3"]);
  });

  it("returns an empty array when no datasets are starred", async () => {
    const { useStarredDatasets } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useStarredDatasets(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useAddFolder", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    resetStore();
    queryClient = makeQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("adds a folder to the store and invalidates the folders list query", async () => {
    const { useAddFolder } = await import("@/core/queries/folders");
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useAddFolder(), {
      wrapper: makeWrapper(queryClient),
    });

    // Act – trigger the mutation
    await act(async () => {
      await result.current.mutateAsync({
        id: "new-folder",
        name: "My Folder",
        parentId: null,
        starred: false,
      });
    });

    // Assert – folder was added to store
    const folders = useFoldersStore.getState().folders;
    expect(folders).toHaveLength(1);
    expect(folders[0].id).toBe("new-folder");
    expect(folders[0].name).toBe("My Folder");
    expect(folders[0].createdAt).toBeTruthy();

    // Assert – cache invalidation fired
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
  });

  it("returns the folder from mutateAsync", async () => {
    const { useAddFolder } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useAddFolder(), {
      wrapper: makeWrapper(queryClient),
    });

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.mutateAsync({
        id: "ret-folder",
        name: "Return Test",
        parentId: "parent-1",
        starred: false,
      });
    });

    expect(returnValue).toMatchObject({ id: "ret-folder", name: "Return Test", parentId: "parent-1" });
  });

  it("invalidates list query for the folder's parentId", async () => {
    const { useAddFolder } = await import("@/core/queries/folders");
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useAddFolder(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        id: "child",
        name: "Child Folder",
        parentId: "parent-x",
        starred: false,
      });
    });

    await waitFor(() => {
      // Should have been called at least twice (once for list(parentId), once for lists())
      expect(invalidateSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useRemoveFolder", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    resetStore();
    queryClient = makeQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("removes the folder from the store", async () => {
    // Arrange
    act(() => {
      useFoldersStore.setState({
        folders: [
          { id: "del-me", name: "Delete Me", parentId: null, starred: false, createdAt: "2024-01-01T00:00:00.000Z" },
          { id: "keep-me", name: "Keep Me", parentId: null, starred: false, createdAt: "2024-01-02T00:00:00.000Z" },
        ],
        datasetFolderMap: {},
        starredDatasets: [],
      });
    });

    const { useRemoveFolder } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useRemoveFolder(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync("del-me");
    });

    const folders = useFoldersStore.getState().folders;
    expect(folders.map((f) => f.id)).toEqual(["keep-me"]);
  });

  it("returns the removed folder id from mutateAsync", async () => {
    act(() => {
      useFoldersStore.setState({
        folders: [
          { id: "target", name: "Target", parentId: null, starred: false, createdAt: "2024-01-01T00:00:00.000Z" },
        ],
        datasetFolderMap: {},
        starredDatasets: [],
      });
    });

    const { useRemoveFolder } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useRemoveFolder(), {
      wrapper: makeWrapper(queryClient),
    });

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.mutateAsync("target");
    });

    expect(returnValue).toBe("target");
  });

  it("invalidates all folders and dataset map queries on success", async () => {
    const { useRemoveFolder } = await import("@/core/queries/folders");
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useRemoveFolder(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync("any-id");
    });

    await waitFor(() => expect(invalidateSpy.mock.calls.length).toBeGreaterThanOrEqual(2));
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useRenameFolder", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    resetStore();
    queryClient = makeQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("renames the target folder in the store", async () => {
    // Arrange
    act(() => {
      useFoldersStore.setState({
        folders: [
          { id: "f1", name: "Old Name", parentId: null, starred: false, createdAt: "2024-01-01T00:00:00.000Z" },
        ],
        datasetFolderMap: {},
        starredDatasets: [],
      });
    });

    const { useRenameFolder } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useRenameFolder(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "f1", name: "New Name" });
    });

    expect(useFoldersStore.getState().folders[0].name).toBe("New Name");
  });

  it("returns { id, name } from mutateAsync", async () => {
    const { useRenameFolder } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useRenameFolder(), {
      wrapper: makeWrapper(queryClient),
    });

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.mutateAsync({ id: "f-rename", name: "Renamed" });
    });

    expect(returnValue).toEqual({ id: "f-rename", name: "Renamed" });
  });

  it("invalidates all folder queries on success", async () => {
    const { useRenameFolder } = await import("@/core/queries/folders");
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useRenameFolder(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "f1", name: "X" });
    });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useStarFolder", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    resetStore();
    queryClient = makeQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("toggles the starred flag on a folder", async () => {
    // Arrange
    act(() => {
      useFoldersStore.setState({
        folders: [
          { id: "f1", name: "Folder", parentId: null, starred: false, createdAt: "2024-01-01T00:00:00.000Z" },
        ],
        datasetFolderMap: {},
        starredDatasets: [],
      });
    });

    const { useStarFolder } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useStarFolder(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync("f1");
    });

    expect(useFoldersStore.getState().folders[0].starred).toBe(true);
  });

  it("returns the folder id from mutateAsync", async () => {
    const { useStarFolder } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useStarFolder(), {
      wrapper: makeWrapper(queryClient),
    });

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.mutateAsync("star-id");
    });

    expect(returnValue).toBe("star-id");
  });

  it("invalidates folder queries on success", async () => {
    const { useStarFolder } = await import("@/core/queries/folders");
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useStarFolder(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync("f1");
    });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useMoveFolder", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    resetStore();
    queryClient = makeQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("moves a folder to a new parent", async () => {
    // Arrange
    act(() => {
      useFoldersStore.setState({
        folders: [
          { id: "parent", name: "Parent", parentId: null, starred: false, createdAt: "2024-01-01T00:00:00.000Z" },
          { id: "child", name: "Child", parentId: null, starred: false, createdAt: "2024-01-02T00:00:00.000Z" },
        ],
        datasetFolderMap: {},
        starredDatasets: [],
      });
    });

    const { useMoveFolder } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useMoveFolder(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "child", newParentId: "parent" });
    });

    const child = useFoldersStore.getState().folders.find((f) => f.id === "child");
    expect(child?.parentId).toBe("parent");
  });

  it("moves a folder to root (newParentId = null)", async () => {
    act(() => {
      useFoldersStore.setState({
        folders: [
          { id: "child", name: "Child", parentId: "parent", starred: false, createdAt: "2024-01-01T00:00:00.000Z" },
        ],
        datasetFolderMap: {},
        starredDatasets: [],
      });
    });

    const { useMoveFolder } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useMoveFolder(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "child", newParentId: null });
    });

    expect(useFoldersStore.getState().folders[0].parentId).toBeNull();
  });

  it("returns { id, newParentId } from mutateAsync", async () => {
    const { useMoveFolder } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useMoveFolder(), {
      wrapper: makeWrapper(queryClient),
    });

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.mutateAsync({ id: "fmove", newParentId: "dest" });
    });

    expect(returnValue).toEqual({ id: "fmove", newParentId: "dest" });
  });

  it("invalidates all folder queries on success", async () => {
    const { useMoveFolder } = await import("@/core/queries/folders");
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useMoveFolder(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "f1", newParentId: null });
    });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useMoveDatasetToFolder", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    resetStore();
    queryClient = makeQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("moves a dataset into a folder", async () => {
    const { useMoveDatasetToFolder } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useMoveDatasetToFolder(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ datasetId: "ds1", folderId: "f1" });
    });

    expect(useFoldersStore.getState().datasetFolderMap["ds1"]).toBe("f1");
  });

  it("moves a dataset to root (folderId = null)", async () => {
    act(() => {
      useFoldersStore.setState({
        folders: [],
        datasetFolderMap: { ds1: "f1" },
        starredDatasets: [],
      });
    });

    const { useMoveDatasetToFolder } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useMoveDatasetToFolder(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ datasetId: "ds1", folderId: null });
    });

    expect(useFoldersStore.getState().datasetFolderMap["ds1"]).toBeNull();
  });

  it("returns { datasetId, folderId } from mutateAsync", async () => {
    const { useMoveDatasetToFolder } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useMoveDatasetToFolder(), {
      wrapper: makeWrapper(queryClient),
    });

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.mutateAsync({ datasetId: "ds-x", folderId: "f-x" });
    });

    expect(returnValue).toEqual({ datasetId: "ds-x", folderId: "f-x" });
  });

  it("invalidates the datasetMap and all folder queries on success", async () => {
    const { useMoveDatasetToFolder } = await import("@/core/queries/folders");
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useMoveDatasetToFolder(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ datasetId: "ds1", folderId: "f1" });
    });

    await waitFor(() => expect(invalidateSpy.mock.calls.length).toBeGreaterThanOrEqual(2));
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useRemoveDatasetFromMap", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    resetStore();
    queryClient = makeQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("removes the dataset entry from the map", async () => {
    // Arrange
    act(() => {
      useFoldersStore.setState({
        folders: [],
        datasetFolderMap: { ds1: "f1", ds2: "f2" },
        starredDatasets: [],
      });
    });

    const { useRemoveDatasetFromMap } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useRemoveDatasetFromMap(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync("ds1");
    });

    const map = useFoldersStore.getState().datasetFolderMap;
    expect("ds1" in map).toBe(false);
    expect(map.ds2).toBe("f2");
  });

  it("returns the removed datasetId from mutateAsync", async () => {
    const { useRemoveDatasetFromMap } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useRemoveDatasetFromMap(), {
      wrapper: makeWrapper(queryClient),
    });

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.mutateAsync("ds-remove");
    });

    expect(returnValue).toBe("ds-remove");
  });

  it("invalidates the datasetMap query on success", async () => {
    const { useRemoveDatasetFromMap } = await import("@/core/queries/folders");
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useRemoveDatasetFromMap(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync("ds1");
    });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useStarDataset", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    resetStore();
    queryClient = makeQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("adds a dataset to the starred list", async () => {
    const { useStarDataset } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useStarDataset(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync("ds-star");
    });

    expect(useFoldersStore.getState().starredDatasets).toContain("ds-star");
  });

  it("toggles a starred dataset back off", async () => {
    // Arrange – already starred
    act(() => {
      useFoldersStore.setState({
        folders: [],
        datasetFolderMap: {},
        starredDatasets: ["ds-toggle"],
      });
    });

    const { useStarDataset } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useStarDataset(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync("ds-toggle");
    });

    expect(useFoldersStore.getState().starredDatasets).not.toContain("ds-toggle");
  });

  it("returns the datasetId from mutateAsync", async () => {
    const { useStarDataset } = await import("@/core/queries/folders");
    const { result } = renderHook(() => useStarDataset(), {
      wrapper: makeWrapper(queryClient),
    });

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.mutateAsync("ds-ret");
    });

    expect(returnValue).toBe("ds-ret");
  });

  it("invalidates the starred query on success", async () => {
    const { useStarDataset } = await import("@/core/queries/folders");
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useStarDataset(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync("ds1");
    });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
  });
});
