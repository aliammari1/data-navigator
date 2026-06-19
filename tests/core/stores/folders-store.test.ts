import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogFolder } from "@/core/stores/folders-store";
import { useFoldersStore } from "@/core/stores/folders-store";

// Mock the persistence boundary so no real fetch / SQLite round-trip fires.
// The store is otherwise a pure synchronous reducer over its slices.
vi.mock("@/platform/settings/settings-client", () => ({
  canUseSettingsApi: () => false,
  getAppSettingRemote: vi.fn(async () => ({ value: null, updatedAt: null })),
  putAppSettingRemote: vi.fn(async () => null),
  deleteAppSettingRemote: vi.fn(async () => undefined),
  exportAppSettingsRemote: vi.fn(async () => ({})),
}));

type NewFolder = Omit<CatalogFolder, "createdAt">;

const folderInput = (overrides: Partial<NewFolder> = {}): NewFolder => ({
  id: overrides.id ?? "f1",
  name: overrides.name ?? "Folder",
  parentId: overrides.parentId ?? null,
  starred: overrides.starred ?? false,
  color: overrides.color,
});

/** Reset store to a clean, deterministic state before each test. */
function resetStore() {
  act(() => {
    useFoldersStore.setState({
      folders: [],
      datasetFolderMap: {},
      starredDatasets: [],
    });
  });
}

describe("useFoldersStore — folders", () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts with empty folders, map, and starred datasets", () => {
    const { result } = renderHook(() => useFoldersStore());

    expect(result.current.folders).toEqual([]);
    expect(result.current.datasetFolderMap).toEqual({});
    expect(result.current.starredDatasets).toEqual([]);
  });

  it("addFolder appends a folder and stamps a serialisable createdAt", () => {
    const { result } = renderHook(() => useFoldersStore());

    act(() => {
      result.current.addFolder(folderInput({ id: "a", name: "Reports" }));
    });

    expect(result.current.folders).toHaveLength(1);
    const [folder] = result.current.folders;
    expect(folder.id).toBe("a");
    expect(folder.name).toBe("Reports");
    expect(folder.parentId).toBeNull();
    expect(folder.starred).toBe(false);
    // createdAt is an ISO string that round-trips through Date.
    expect(typeof folder.createdAt).toBe("string");
    expect(Number.isNaN(Date.parse(folder.createdAt))).toBe(false);
  });

  it("addFolder preserves an explicit parentId and color", () => {
    const { result } = renderHook(() => useFoldersStore());

    act(() => {
      result.current.addFolder(folderInput({ id: "child", parentId: "root", color: "#2f6bff" }));
    });

    const [folder] = result.current.folders;
    expect(folder.parentId).toBe("root");
    expect(folder.color).toBe("#2f6bff");
  });

  it("addFolder does not mutate the previous folders array (immutability)", () => {
    const { result } = renderHook(() => useFoldersStore());

    act(() => {
      result.current.addFolder(folderInput({ id: "a" }));
    });
    const firstRef = result.current.folders;

    act(() => {
      result.current.addFolder(folderInput({ id: "b" }));
    });

    expect(result.current.folders).not.toBe(firstRef);
    expect(firstRef).toHaveLength(1);
    expect(result.current.folders).toHaveLength(2);
  });

  it("renameFolder updates only the targeted folder", () => {
    const { result } = renderHook(() => useFoldersStore());

    act(() => {
      result.current.addFolder(folderInput({ id: "a", name: "Old A" }));
      result.current.addFolder(folderInput({ id: "b", name: "Old B" }));
      result.current.renameFolder("a", "New A");
    });

    const byId = Object.fromEntries(result.current.folders.map((f) => [f.id, f.name]));
    expect(byId).toEqual({ a: "New A", b: "Old B" });
  });

  it("renameFolder is a no-op when the folder does not exist", () => {
    const { result } = renderHook(() => useFoldersStore());

    act(() => {
      result.current.addFolder(folderInput({ id: "a", name: "Keep" }));
      result.current.renameFolder("missing", "Whatever");
    });

    expect(result.current.folders.map((f) => f.name)).toEqual(["Keep"]);
  });

  it("starFolder toggles the starred flag on and off", () => {
    const { result } = renderHook(() => useFoldersStore());

    act(() => {
      result.current.addFolder(folderInput({ id: "a", starred: false }));
    });
    expect(result.current.folders[0].starred).toBe(false);

    act(() => {
      result.current.starFolder("a");
    });
    expect(result.current.folders[0].starred).toBe(true);

    act(() => {
      result.current.starFolder("a");
    });
    expect(result.current.folders[0].starred).toBe(false);
  });

  it("moveFolder re-parents the targeted folder", () => {
    const { result } = renderHook(() => useFoldersStore());

    act(() => {
      result.current.addFolder(folderInput({ id: "parent", parentId: null }));
      result.current.addFolder(folderInput({ id: "child", parentId: null }));
      result.current.moveFolder("child", "parent");
    });

    const child = result.current.folders.find((f) => f.id === "child");
    expect(child?.parentId).toBe("parent");
  });

  it("moveFolder can move a folder back to root (null parent)", () => {
    const { result } = renderHook(() => useFoldersStore());

    act(() => {
      result.current.addFolder(folderInput({ id: "child", parentId: "parent" }));
      result.current.moveFolder("child", null);
    });

    expect(result.current.folders[0].parentId).toBeNull();
  });
});

describe("useFoldersStore — removeFolder cascade", () => {
  beforeEach(() => {
    resetStore();
  });

  it("removes a leaf folder and leaves siblings intact", () => {
    const { result } = renderHook(() => useFoldersStore());

    act(() => {
      result.current.addFolder(folderInput({ id: "a" }));
      result.current.addFolder(folderInput({ id: "b" }));
      result.current.removeFolder("a");
    });

    expect(result.current.folders.map((f) => f.id)).toEqual(["b"]);
  });

  it("removes a folder together with all nested descendants", () => {
    const { result } = renderHook(() => useFoldersStore());

    act(() => {
      result.current.addFolder(folderInput({ id: "root", parentId: null }));
      result.current.addFolder(folderInput({ id: "child", parentId: "root" }));
      result.current.addFolder(folderInput({ id: "grandchild", parentId: "child" }));
      result.current.addFolder(folderInput({ id: "unrelated", parentId: null }));
      result.current.removeFolder("root");
    });

    expect(result.current.folders.map((f) => f.id)).toEqual(["unrelated"]);
  });

  it("reparents datasets in removed folders back to root (null)", () => {
    const { result } = renderHook(() => useFoldersStore());

    act(() => {
      result.current.addFolder(folderInput({ id: "root", parentId: null }));
      result.current.addFolder(folderInput({ id: "child", parentId: "root" }));
      result.current.moveDataset("ds-in-root", "root");
      result.current.moveDataset("ds-in-child", "child");
      result.current.moveDataset("ds-elsewhere", "other");
      result.current.removeFolder("root");
    });

    // Datasets whose folder was removed fall back to root; others untouched.
    expect(result.current.datasetFolderMap).toEqual({
      "ds-in-root": null,
      "ds-in-child": null,
      "ds-elsewhere": "other",
    });
  });

  it("leaves datasets already at root untouched on removal", () => {
    const { result } = renderHook(() => useFoldersStore());

    act(() => {
      result.current.addFolder(folderInput({ id: "a" }));
      result.current.moveDataset("ds-root", null);
      result.current.removeFolder("a");
    });

    expect(result.current.datasetFolderMap).toEqual({ "ds-root": null });
  });

  it("is a no-op when removing a non-existent folder id", () => {
    const { result } = renderHook(() => useFoldersStore());

    act(() => {
      result.current.addFolder(folderInput({ id: "a" }));
      result.current.removeFolder("ghost");
    });

    expect(result.current.folders.map((f) => f.id)).toEqual(["a"]);
  });
});

describe("useFoldersStore — dataset placement", () => {
  beforeEach(() => {
    resetStore();
  });

  it("moveDataset records a datasetId -> folderId mapping", () => {
    const { result } = renderHook(() => useFoldersStore());

    act(() => {
      result.current.moveDataset("ds1", "folder-x");
    });

    expect(result.current.datasetFolderMap.ds1).toBe("folder-x");
  });

  it("moveDataset to null places the dataset at root", () => {
    const { result } = renderHook(() => useFoldersStore());

    act(() => {
      result.current.moveDataset("ds1", "folder-x");
      result.current.moveDataset("ds1", null);
    });

    expect(result.current.datasetFolderMap.ds1).toBeNull();
  });

  it("moveDataset overwrites a previous placement for the same dataset", () => {
    const { result } = renderHook(() => useFoldersStore());

    act(() => {
      result.current.moveDataset("ds1", "a");
      result.current.moveDataset("ds1", "b");
    });

    expect(result.current.datasetFolderMap.ds1).toBe("b");
    expect(Object.keys(result.current.datasetFolderMap)).toEqual(["ds1"]);
  });

  it("removeDatasetFromMap deletes the entry entirely", () => {
    const { result } = renderHook(() => useFoldersStore());

    act(() => {
      result.current.moveDataset("ds1", "a");
      result.current.moveDataset("ds2", "b");
      result.current.removeDatasetFromMap("ds1");
    });

    expect(result.current.datasetFolderMap).toEqual({ ds2: "b" });
    expect("ds1" in result.current.datasetFolderMap).toBe(false);
  });

  it("removeDatasetFromMap is a no-op for an unknown dataset", () => {
    const { result } = renderHook(() => useFoldersStore());

    act(() => {
      result.current.moveDataset("ds1", "a");
      result.current.removeDatasetFromMap("does-not-exist");
    });

    expect(result.current.datasetFolderMap).toEqual({ ds1: "a" });
  });
});

describe("useFoldersStore — dataset starring", () => {
  beforeEach(() => {
    resetStore();
  });

  it("starDataset adds an unstarred dataset to the starred list", () => {
    const { result } = renderHook(() => useFoldersStore());

    act(() => {
      result.current.starDataset("ds1");
    });

    expect(result.current.starredDatasets).toEqual(["ds1"]);
  });

  it("starDataset toggles a starred dataset back off", () => {
    const { result } = renderHook(() => useFoldersStore());

    act(() => {
      result.current.starDataset("ds1");
      result.current.starDataset("ds1");
    });

    expect(result.current.starredDatasets).toEqual([]);
  });

  it("starDataset tracks multiple distinct datasets", () => {
    const { result } = renderHook(() => useFoldersStore());

    act(() => {
      result.current.starDataset("ds1");
      result.current.starDataset("ds2");
    });

    expect(result.current.starredDatasets).toEqual(["ds1", "ds2"]);

    act(() => {
      result.current.starDataset("ds1");
    });

    expect(result.current.starredDatasets).toEqual(["ds2"]);
  });

  it("does not duplicate a dataset id when toggled on twice across other ops", () => {
    const { result } = renderHook(() => useFoldersStore());

    act(() => {
      result.current.starDataset("ds1");
    });
    act(() => {
      result.current.starDataset("ds1"); // off
    });
    act(() => {
      result.current.starDataset("ds1"); // on again
    });

    expect(result.current.starredDatasets).toEqual(["ds1"]);
  });
});
