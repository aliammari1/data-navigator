import { beforeEach, describe, expect, it } from "vitest";
import {
  getOrderedFiles,
  useImportSession,
} from "@/features/data-import/model/import-session-store";
import type { ParsedFileInfo } from "@/features/data-import/model/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeFile(overrides: Partial<ParsedFileInfo> & { id: string }): ParsedFileInfo {
  return {
    id: overrides.id,
    name: overrides.name ?? `file-${overrides.id}.csv`,
    size: overrides.size ?? 1024,
    fileType: overrides.fileType ?? "csv",
    status: overrides.status ?? "idle",
    progress: overrides.progress ?? 0,
    rowCount: overrides.rowCount ?? 100,
    columnCount: overrides.columnCount ?? 3,
    columns: overrides.columns ?? [],
    previewRows: overrides.previewRows ?? [],
    issues: overrides.issues ?? [],
    parseTime: overrides.parseTime ?? 42,
    dbTableName: overrides.dbTableName ?? null,
    datasetId: overrides.datasetId,
    error: overrides.error,
    uploadedAt: overrides.uploadedAt ?? new Date("2024-01-01"),
    hasHeader: overrides.hasHeader ?? true,
    encoding: overrides.encoding ?? "auto",
    skipEmptyLines: overrides.skipEmptyLines ?? false,
    rejectCount: overrides.rejectCount,
    completeness: overrides.completeness ?? 1,
    accuracy: overrides.accuracy ?? 1,
    consistency: overrides.consistency ?? 1,
    uniqueness: overrides.uniqueness ?? 1,
    metadataSource: overrides.metadataSource ?? "preview",
  };
}

// ─── Reset before each test ───────────────────────────────────────────────────

beforeEach(() => {
  useImportSession.getState().reset();
});

// ─── Initial state ───────────────────────────────────────────────────────────

describe("useImportSession — initial state", () => {
  it("starts with empty files and an empty order", () => {
    const state = useImportSession.getState();
    expect(state.files).toEqual({});
    expect(state.order).toEqual([]);
  });
});

// ─── add ─────────────────────────────────────────────────────────────────────

describe("useImportSession — add", () => {
  it("stores the file under its id", () => {
    const file = makeFile({ id: "f1" });
    useImportSession.getState().add(file);

    const state = useImportSession.getState();
    expect(state.files["f1"]).toEqual(file);
  });

  it("prepends the id to the order (most-recent first)", () => {
    useImportSession.getState().add(makeFile({ id: "f1" }));
    useImportSession.getState().add(makeFile({ id: "f2" }));

    expect(useImportSession.getState().order).toEqual(["f2", "f1"]);
  });

  it("does NOT duplicate the id in order when the same id is added again", () => {
    const file = makeFile({ id: "f1" });
    useImportSession.getState().add(file);
    // Add again — this hits the `state.order.includes(file.id)` true branch.
    useImportSession.getState().add(file);

    expect(useImportSession.getState().order).toEqual(["f1"]);
    expect(useImportSession.getState().order).toHaveLength(1);
  });

  it("updates the file data when the same id is added a second time", () => {
    useImportSession.getState().add(makeFile({ id: "f1", name: "original.csv" }));
    useImportSession.getState().add(makeFile({ id: "f1", name: "updated.csv" }));

    // The files map is overwritten; order stays deduplicated.
    expect(useImportSession.getState().files["f1"].name).toBe("updated.csv");
  });

  it("keeps insertion order intact across multiple distinct files", () => {
    useImportSession.getState().add(makeFile({ id: "a" }));
    useImportSession.getState().add(makeFile({ id: "b" }));
    useImportSession.getState().add(makeFile({ id: "c" }));

    expect(useImportSession.getState().order).toEqual(["c", "b", "a"]);
  });
});

// ─── patch ───────────────────────────────────────────────────────────────────

describe("useImportSession — patch", () => {
  it("merges the partial update into an existing file", () => {
    const file = makeFile({ id: "f1", progress: 0, status: "idle" });
    useImportSession.getState().add(file);

    useImportSession.getState().patch("f1", { progress: 50, status: "parsing" });

    const updated = useImportSession.getState().files["f1"];
    expect(updated.progress).toBe(50);
    expect(updated.status).toBe("parsing");
    // Fields not in the patch are preserved.
    expect(updated.name).toBe(file.name);
  });

  it("returns the unchanged state object when the id does not exist", () => {
    // This exercises the `if (!existing) return state` early-return branch.
    useImportSession.getState().add(makeFile({ id: "f1" }));
    const before = useImportSession.getState();

    // Patch a non-existent id — state must not change.
    useImportSession.getState().patch("nonexistent", { progress: 99 });

    const after = useImportSession.getState();
    // The files map is identical (same reference via the early return).
    expect(after.files).toEqual(before.files);
    expect(after.order).toEqual(before.order);
  });

  it("does not affect other files when patching one", () => {
    useImportSession.getState().add(makeFile({ id: "f1", progress: 0 }));
    useImportSession.getState().add(makeFile({ id: "f2", progress: 10 }));

    useImportSession.getState().patch("f1", { progress: 75 });

    expect(useImportSession.getState().files["f1"].progress).toBe(75);
    expect(useImportSession.getState().files["f2"].progress).toBe(10);
  });

  it("can patch to done status with 100% progress", () => {
    useImportSession.getState().add(makeFile({ id: "f1" }));
    useImportSession.getState().patch("f1", { status: "done", progress: 100 });

    expect(useImportSession.getState().files["f1"].status).toBe("done");
    expect(useImportSession.getState().files["f1"].progress).toBe(100);
  });
});

// ─── remove ──────────────────────────────────────────────────────────────────

describe("useImportSession — remove", () => {
  it("deletes the file entry and removes the id from order", () => {
    useImportSession.getState().add(makeFile({ id: "f1" }));
    useImportSession.getState().add(makeFile({ id: "f2" }));

    useImportSession.getState().remove("f1");

    const state = useImportSession.getState();
    expect("f1" in state.files).toBe(false);
    expect(state.order).not.toContain("f1");
    expect(state.order).toContain("f2");
  });

  it("returns unchanged state when the id is not in files", () => {
    // Exercises the `if (!(id in state.files)) return state` early-return branch.
    useImportSession.getState().add(makeFile({ id: "f1" }));
    const before = useImportSession.getState();

    useImportSession.getState().remove("nonexistent");

    const after = useImportSession.getState();
    expect(after.files).toEqual(before.files);
    expect(after.order).toEqual(before.order);
  });

  it("removes only the targeted file when multiple files are present", () => {
    useImportSession.getState().add(makeFile({ id: "a" }));
    useImportSession.getState().add(makeFile({ id: "b" }));
    useImportSession.getState().add(makeFile({ id: "c" }));

    useImportSession.getState().remove("b");

    const state = useImportSession.getState();
    expect(Object.keys(state.files)).toEqual(expect.arrayContaining(["a", "c"]));
    expect("b" in state.files).toBe(false);
    expect(state.order).toEqual(["c", "a"]);
  });

  it("results in an empty store when the only file is removed", () => {
    useImportSession.getState().add(makeFile({ id: "only" }));
    useImportSession.getState().remove("only");

    expect(useImportSession.getState().files).toEqual({});
    expect(useImportSession.getState().order).toEqual([]);
  });
});

// ─── reset ───────────────────────────────────────────────────────────────────

describe("useImportSession — reset", () => {
  it("clears all files and the order", () => {
    useImportSession.getState().add(makeFile({ id: "x" }));
    useImportSession.getState().add(makeFile({ id: "y" }));

    useImportSession.getState().reset();

    expect(useImportSession.getState().files).toEqual({});
    expect(useImportSession.getState().order).toEqual([]);
  });

  it("is idempotent — calling reset on an already-empty store is safe", () => {
    useImportSession.getState().reset();
    useImportSession.getState().reset();

    expect(useImportSession.getState().files).toEqual({});
    expect(useImportSession.getState().order).toEqual([]);
  });
});

// ─── getOrderedFiles ─────────────────────────────────────────────────────────

describe("getOrderedFiles", () => {
  it("returns an empty array when no files have been added", () => {
    expect(getOrderedFiles()).toEqual([]);
  });

  it("returns files in display order (most-recent first)", () => {
    const f1 = makeFile({ id: "f1" });
    const f2 = makeFile({ id: "f2" });
    useImportSession.getState().add(f1);
    useImportSession.getState().add(f2);

    const result = getOrderedFiles();
    // f2 was added last so it appears first.
    expect(result[0].id).toBe("f2");
    expect(result[1].id).toBe("f1");
    expect(result).toHaveLength(2);
  });

  it("filters out undefined entries when an id in order has no corresponding file", () => {
    // Manually place the store in an inconsistent state: an id in order that
    // has no matching entry in files. The filter(Boolean) guard must handle this.
    useImportSession.setState({
      files: {},
      order: ["ghost-id"],
    });

    const result = getOrderedFiles();
    // The undefined is filtered out, leaving an empty array.
    expect(result).toEqual([]);
  });

  it("returns only files that exist in the files map, skipping dangling ids", () => {
    const real = makeFile({ id: "real" });
    useImportSession.setState({
      files: { real },
      order: ["dangling", "real"],
    });

    const result = getOrderedFiles();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("real");
  });

  it("reflects the current store state (non-reactive snapshot)", () => {
    const f = makeFile({ id: "snap" });
    useImportSession.getState().add(f);

    const snapshot = getOrderedFiles();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toEqual(f);
  });
});
