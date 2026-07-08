import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useDatasetFolder,
  useDatasetFolderMap,
  useFolder,
  useFolders,
  useStarredDatasets,
} from "@/core/queries/folders";
import type { CatalogFolder } from "@/core/stores/folders-store";
import { useFoldersStore } from "@/core/stores/folders-store";
import { createTestQueryClient } from "../../test-utils";

// Mock the persistence boundary so the store never reaches the network.
vi.mock("@/platform/settings/settings-client", () => ({
  canUseSettingsApi: () => false,
  getAppSettingRemote: vi.fn(async () => ({ value: null, updatedAt: null })),
  putAppSettingRemote: vi.fn(async () => null),
  deleteAppSettingRemote: vi.fn(async () => undefined),
  exportAppSettingsRemote: vi.fn(async () => ({})),
}));

const folder = (overrides: Partial<CatalogFolder> = {}): CatalogFolder => ({
  id: overrides.id ?? "f1",
  name: overrides.name ?? "Folder",
  parentId: overrides.parentId ?? null,
  starred: overrides.starred ?? false,
  color: overrides.color,
  createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
});

/** Fresh provider per hook render so the RQ cache is isolated. */
function makeWrapper() {
  const client = createTestQueryClient();
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function seedStore(state: {
  folders?: CatalogFolder[];
  datasetFolderMap?: Record<string, string | null>;
  starredDatasets?: string[];
}) {
  act(() => {
    useFoldersStore.setState({
      folders: state.folders ?? [],
      datasetFolderMap: state.datasetFolderMap ?? {},
      starredDatasets: state.starredDatasets ?? [],
    });
  });
}

beforeEach(() => {
  seedStore({});
});

describe("useFolders", () => {
  it("returns all folders when no parentId argument is provided", async () => {
    const folders = [folder({ id: "a" }), folder({ id: "b", parentId: "a" })];
    seedStore({ folders });

    const { result } = renderHook(() => useFolders(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((f) => f.id)).toEqual(["a", "b"]);
  });

  it("filters to direct children of a given parentId", async () => {
    const folders = [
      folder({ id: "root", parentId: null }),
      folder({ id: "child1", parentId: "root" }),
      folder({ id: "child2", parentId: "root" }),
      folder({ id: "grandchild", parentId: "child1" }),
    ];
    seedStore({ folders });

    const { result } = renderHook(() => useFolders("root"), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((f) => f.id)).toEqual(["child1", "child2"]);
  });

  it("returns only top-level folders when parentId is null", async () => {
    const folders = [
      folder({ id: "top1", parentId: null }),
      folder({ id: "top2", parentId: null }),
      folder({ id: "nested", parentId: "top1" }),
    ];
    seedStore({ folders });

    const { result } = renderHook(() => useFolders(null), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((f) => f.id)).toEqual(["top1", "top2"]);
  });

  it("returns an empty array when no folder matches the parentId", async () => {
    seedStore({ folders: [folder({ id: "a", parentId: null })] });

    const { result } = renderHook(() => useFolders("nonexistent"), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

describe("useFolder", () => {
  it("returns the matching folder by id", async () => {
    seedStore({
      folders: [folder({ id: "a", name: "Alpha" }), folder({ id: "b" })],
    });

    const { result } = renderHook(() => useFolder("a"), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.name).toBe("Alpha");
  });

  it("returns null when the id is not found", async () => {
    seedStore({ folders: [folder({ id: "a" })] });

    const { result } = renderHook(() => useFolder("missing"), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("is disabled (does not fetch) when id is null", () => {
    seedStore({ folders: [folder({ id: "a" })] });

    const { result } = renderHook(() => useFolder(null), {
      wrapper: makeWrapper(),
    });

    // `enabled: !!id` keeps the query idle, so it never resolves data.
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });
});

describe("useDatasetFolderMap", () => {
  it("returns the full dataset-to-folder mapping", async () => {
    const datasetFolderMap = { ds1: "a", ds2: null };
    seedStore({ datasetFolderMap });

    const { result } = renderHook(() => useDatasetFolderMap(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ ds1: "a", ds2: null });
  });

  it("returns an empty object when nothing is mapped", async () => {
    seedStore({ datasetFolderMap: {} });

    const { result } = renderHook(() => useDatasetFolderMap(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({});
  });
});

describe("useDatasetFolder", () => {
  it("returns the folder id for a placed dataset", async () => {
    seedStore({ datasetFolderMap: { ds1: "folder-x" } });

    const { result } = renderHook(() => useDatasetFolder("ds1"), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe("folder-x");
  });

  it("returns null for a dataset that is mapped to root (null)", async () => {
    seedStore({ datasetFolderMap: { ds1: null } });

    const { result } = renderHook(() => useDatasetFolder("ds1"), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("returns null for a dataset that has no mapping entry", async () => {
    seedStore({ datasetFolderMap: {} });

    const { result } = renderHook(() => useDatasetFolder("unknown"), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("is disabled when datasetId is null", () => {
    seedStore({ datasetFolderMap: { ds1: "a" } });

    const { result } = renderHook(() => useDatasetFolder(null), {
      wrapper: makeWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });
});

describe("useStarredDatasets", () => {
  it("returns the list of starred dataset ids", async () => {
    seedStore({ starredDatasets: ["ds1", "ds2"] });

    const { result } = renderHook(() => useStarredDatasets(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(["ds1", "ds2"]);
  });

  it("returns an empty array when nothing is starred", async () => {
    seedStore({ starredDatasets: [] });

    const { result } = renderHook(() => useStarredDatasets(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
