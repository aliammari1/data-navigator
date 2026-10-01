import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PathAccessController } from "../../electron/security";

describe("PathAccessController filesystem boundaries", () => {
  let root: string;
  let dataDir: string;
  let outsideDir: string;
  let access: PathAccessController;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "dn-path-access-"));
    dataDir = path.join(root, "data");
    outsideDir = path.join(root, "outside");
    fs.mkdirSync(dataDir);
    fs.mkdirSync(outsideDir);
    fs.writeFileSync(path.join(outsideDir, "private.txt"), "private");
    fs.symlinkSync(outsideDir, path.join(dataDir, "escape"), "dir");
    access = new PathAccessController(dataDir);
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("blocks reads through a directory symlink outside app data", () => {
    expect(() =>
      access.assertAllowedReadPath(path.join(dataDir, "escape", "private.txt")),
    ).toThrow();
  });

  it("blocks writes and deletes through a directory symlink outside app data", () => {
    expect(() => access.assertAllowedWritePath(path.join(dataDir, "escape", "new.txt"))).toThrow();
    expect(() =>
      access.assertAllowedDeletePath(path.join(dataDir, "escape", "private.txt")),
    ).toThrow();
  });

  it("blocks listing a symlinked directory outside app data", () => {
    expect(() => access.assertAllowedDirectoryPath(path.join(dataDir, "escape"))).toThrow();
  });

  it("blocks writing through a dangling symlink", () => {
    const link = path.join(dataDir, "dangling.txt");
    fs.symlinkSync(path.join(outsideDir, "future.txt"), link);
    expect(() => access.assertAllowedWritePath(link)).toThrow();
  });

  it("allows a new save target inside app data", () => {
    const target = path.join(dataDir, "new", "report.csv");
    expect(access.assertAllowedWritePath(target)).toBe(target);
  });

  it("preserves a user-selected symlink to an outside file", () => {
    const selected = path.join(dataDir, "selected.txt");
    const target = path.join(outsideDir, "private.txt");
    fs.symlinkSync(target, selected);
    access.rememberReadPath(selected);
    expect(access.assertAllowedReadPath(selected)).toBe(target);
  });

  it("blocks a selected symlink retargeted after authorization", () => {
    const selected = path.join(dataDir, "selected.txt");
    const original = path.join(outsideDir, "private.txt");
    const replacement = path.join(outsideDir, "other.txt");
    fs.writeFileSync(replacement, "other");
    fs.symlinkSync(original, selected);
    access.rememberReadPath(selected);
    fs.unlinkSync(selected);
    fs.symlinkSync(replacement, selected);
    expect(() => access.assertAllowedReadPath(selected)).toThrow();
  });
});
