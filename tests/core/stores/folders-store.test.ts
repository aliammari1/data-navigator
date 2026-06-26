import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogFolder } from "@/core/stores/folders-store";
import { useFoldersStore, useFoldersSlice, useFoldersActions } from "@/core/stores/folders-store";

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

  it("starFolder leaves non-targeted folders unchanged", () => {
    const { result } = renderHook(() => useFoldersStore());

    act(() => {
      result.current.addFolder(folderInput({ id: "a", starred: false }));
      result.current.addFolder(folderInput({ id: "b", starred: false }));
      result.current.starFolder("a");
    });

    const byId = Object.fromEntries(result.current.folders.map((f) => [f.id, f.starred]));
    expect(byId).toEqual({ a: true, b: false });
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

// ─── migrate function ────────────────────────────────────────────────────────

describe("useFoldersStore — persist.migrate", () => {
  // Extract the migrate function directly from the persist options.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const migrate = (useFoldersStore as any).persist.getOptions().migrate as (
    persisted: unknown,
    version: number,
  ) => { folders: CatalogFolder[]; datasetFolderMap: Record<string, string | null>; starredDatasets: string[] };

  it("returns empty slices when persisted is null/undefined", () => {
    const resultNull = migrate(null, 0);
    expect(resultNull.folders).toEqual([]);
    expect(resultNull.datasetFolderMap).toEqual({});
    expect(resultNull.starredDatasets).toEqual([]);

    const resultUndefined = migrate(undefined, 0);
    expect(resultUndefined.folders).toEqual([]);
    expect(resultUndefined.datasetFolderMap).toEqual({});
    expect(resultUndefined.starredDatasets).toEqual([]);
  });

  it("returns empty folders array when prev.folders is not an array", () => {
    const result = migrate({ folders: "not-an-array" }, 0);
    expect(result.folders).toEqual([]);
  });

  it("returns empty folders array when prev.folders is null", () => {
    const result = migrate({ folders: null }, 0);
    expect(result.folders).toEqual([]);
  });

  it("backfills missing folder fields with defaults", () => {
    // A raw entry with no fields at all (all defaulted).
    const result = migrate({ folders: [{}] }, 0);
    expect(result.folders).toHaveLength(1);
    const f = result.folders[0];
    expect(f.id).toBe("");
    expect(f.name).toBe("");
    expect(f.parentId).toBeNull();
    expect(f.starred).toBe(false);
    expect(typeof f.createdAt).toBe("string");
    expect(Number.isNaN(Date.parse(f.createdAt))).toBe(false);
  });

  it("preserves valid folder fields from persisted state", () => {
    const raw = {
      id: "f1",
      name: "Reports",
      parentId: "parent",
      starred: true,
      color: "#ff0000",
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    const result = migrate({ folders: [raw] }, 0);
    const f = result.folders[0];
    expect(f.id).toBe("f1");
    expect(f.name).toBe("Reports");
    expect(f.parentId).toBe("parent");
    expect(f.starred).toBe(true);
    expect(f.color).toBe("#ff0000");
    expect(f.createdAt).toBe("2024-01-01T00:00:00.000Z");
  });

  it("backfills individual missing folder sub-fields while keeping provided ones", () => {
    // Provide only id + name, other fields should be defaulted.
    const result = migrate({ folders: [{ id: "x", name: "X" }] }, 0);
    const f = result.folders[0];
    expect(f.id).toBe("x");
    expect(f.name).toBe("X");
    expect(f.parentId).toBeNull();
    expect(f.starred).toBe(false);
    expect(f.color).toBeUndefined();
  });

  it("handles a null entry inside the folders array without throwing", () => {
    // raw === null -> (raw ?? {}) => {} -> all fields default
    const result = migrate({ folders: [null] }, 0);
    expect(result.folders).toHaveLength(1);
    expect(result.folders[0].id).toBe("");
  });

  it("returns empty datasetFolderMap when prev.datasetFolderMap is absent", () => {
    const result = migrate({}, 0);
    expect(result.datasetFolderMap).toEqual({});
  });

  it("returns empty datasetFolderMap when prev.datasetFolderMap is not an object", () => {
    const result = migrate({ datasetFolderMap: "wrong" }, 0);
    expect(result.datasetFolderMap).toEqual({});
  });

  it("returns empty datasetFolderMap when prev.datasetFolderMap is null-ish", () => {
    const result = migrate({ datasetFolderMap: null }, 0);
    expect(result.datasetFolderMap).toEqual({});
  });

  it("keeps null values in datasetFolderMap (root placements)", () => {
    const result = migrate({ datasetFolderMap: { ds1: null } }, 0);
    expect(result.datasetFolderMap).toEqual({ ds1: null });
  });

  it("keeps string values in datasetFolderMap (folder placements)", () => {
    const result = migrate({ datasetFolderMap: { ds1: "folder-a" } }, 0);
    expect(result.datasetFolderMap).toEqual({ ds1: "folder-a" });
  });

  it("prunes malformed (non-string, non-null) values from datasetFolderMap", () => {
    const result = migrate(
      { datasetFolderMap: { good: "folder-a", root: null, bad: 42, worse: true } },
      0,
    );
    expect(result.datasetFolderMap).toEqual({ good: "folder-a", root: null });
  });

  it("returns empty starredDatasets when prev.starredDatasets is not an array", () => {
    const result = migrate({ starredDatasets: "nope" }, 0);
    expect(result.starredDatasets).toEqual([]);
  });

  it("returns empty starredDatasets when prev.starredDatasets is null", () => {
    const result = migrate({ starredDatasets: null }, 0);
    expect(result.starredDatasets).toEqual([]);
  });

  it("keeps only string entries in starredDatasets (filters out non-strings)", () => {
    const result = migrate({ starredDatasets: ["ds1", 42, null, "ds2", true] }, 0);
    expect(result.starredDatasets).toEqual(["ds1", "ds2"]);
  });

  it("preserves a valid starredDatasets array as-is", () => {
    const result = migrate({ starredDatasets: ["a", "b", "c"] }, 0);
    expect(result.starredDatasets).toEqual(["a", "b", "c"]);
  });

  it("handles a fully-populated valid persisted state in one shot", () => {
    const persisted = {
      folders: [
        { id: "f1", name: "Root", parentId: null, starred: false, createdAt: "2024-06-01T00:00:00.000Z" },
      ],
      datasetFolderMap: { ds1: "f1", ds2: null },
      starredDatasets: ["ds1"],
    };
    const result = migrate(persisted, 0);
    expect(result.folders).toHaveLength(1);
    expect(result.datasetFolderMap).toEqual({ ds1: "f1", ds2: null });
    expect(result.starredDatasets).toEqual(["ds1"]);
  });
});

// ─── Selector hooks ──────────────────────────────────────────────────────────

describe("useFoldersSlice", () => {
  beforeEach(() => {
    act(() => {
      useFoldersStore.setState({
        folders: [],
        datasetFolderMap: {},
        starredDatasets: [],
      });
    });
  });

  it("returns the three state slices from the store", () => {
    act(() => {
      useFoldersStore.setState({
        folders: [
          { id: "f1", name: "A", parentId: null, starred: false, createdAt: "2024-01-01T00:00:00.000Z" },
        ],
        datasetFolderMap: { ds1: "f1" },
        starredDatasets: ["ds1"],
      });
    });

    const { result } = renderHook(() => useFoldersSlice());

    expect(result.current.folders).toHaveLength(1);
    expect(result.current.datasetFolderMap).toEqual({ ds1: "f1" });
    expect(result.current.starredDatasets).toEqual(["ds1"]);
  });

  it("updates when the store changes", () => {
    const { result } = renderHook(() => useFoldersSlice());

    expect(result.current.starredDatasets).toEqual([]);

    act(() => {
      useFoldersStore.getState().starDataset("ds2");
    });

    expect(result.current.starredDatasets).toEqual(["ds2"]);
  });
});

describe("useFoldersActions", () => {
  beforeEach(() => {
    act(() => {
      useFoldersStore.setState({
        folders: [],
        datasetFolderMap: {},
        starredDatasets: [],
      });
    });
  });

  it("returns all action functions", () => {
    const { result } = renderHook(() => useFoldersActions());

    expect(typeof result.current.addFolder).toBe("function");
    expect(typeof result.current.removeFolder).toBe("function");
    expect(typeof result.current.renameFolder).toBe("function");
    expect(typeof result.current.starFolder).toBe("function");
    expect(typeof result.current.moveFolder).toBe("function");
    expect(typeof result.current.moveDataset).toBe("function");
    expect(typeof result.current.removeDatasetFromMap).toBe("function");
    expect(typeof result.current.starDataset).toBe("function");
  });

  it("actions from the hook mutate the store correctly", () => {
    const { result } = renderHook(() => useFoldersActions());

    act(() => {
      result.current.addFolder({ id: "f1", name: "Hook Folder", parentId: null, starred: false });
    });

    expect(useFoldersStore.getState().folders).toHaveLength(1);
    expect(useFoldersStore.getState().folders[0].name).toBe("Hook Folder");
  });
});
