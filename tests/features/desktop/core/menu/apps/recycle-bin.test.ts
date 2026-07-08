import { describe, expect, it } from "vitest";

import { buildMenu } from "@/features/desktop/core/menu/apps/recycle-bin";

import { findGroup, getAction, makeMenuContext } from "./menu-context";

/**
 * Behavioral test suite for the "recycle-bin" app menu (Corbeille).
 *
 * `buildMenu` is a pure function of {@link MenuContext} → declarative menu
 * data. Each test asserts both the declared shape and the real ctx action
 * wired to `run()`.
 */

// ─── Menu shape ───────────────────────────────────────────────────────────────

describe("recycle-bin buildMenu — shape", () => {
  it("declares exactly the Fichier and Corbeille groups, in order", () => {
    const groups = buildMenu(makeMenuContext());
    expect(groups.map((g) => g.id)).toEqual(["file", "bin"]);
  });

  it("labels the groups in French", () => {
    const groups = buildMenu(makeMenuContext());
    expect(findGroup(groups, "file")?.label).toBe("Fichier");
    expect(findGroup(groups, "bin")?.label).toBe("Corbeille");
  });

  it("declares the expected Fichier item ids in order", () => {
    const groups = buildMenu(makeMenuContext());
    const file = findGroup(groups, "file");
    expect(file?.items.map((i) => i.id)).toEqual([
      "new-window",
      "sep-file",
      "empty",
      "sep-close",
      "close",
    ]);
  });

  it("declares the expected Corbeille item ids in order", () => {
    const groups = buildMenu(makeMenuContext());
    const bin = findGroup(groups, "bin");
    expect(bin?.items.map((i) => i.id)).toEqual([
      "restore-all",
      "empty-bin",
      "sep-bin",
      "open-folders",
    ]);
  });

  it("marks both empty actions as danger", () => {
    const groups = buildMenu(makeMenuContext());
    const file = findGroup(groups, "file");
    const bin = findGroup(groups, "bin");
    expect(getAction(file?.items ?? [], "empty").danger).toBe(true);
    expect(getAction(bin?.items ?? [], "empty-bin").danger).toBe(true);
  });
});

// ─── Fichier actions ──────────────────────────────────────────────────────────

describe("recycle-bin buildMenu — Fichier actions", () => {
  it("'new-window' opens a forced-new recycle-bin window", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "new-window").run();
    expect(ctx.openApp).toHaveBeenCalledWith("recycle-bin", { forceNew: true });
  });

  it("'empty' dispatches the 'empty' command", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "empty").run();
    expect(ctx.command).toHaveBeenCalledWith("empty");
  });

  it("'close' closes the focused window", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "close").run();
    expect(ctx.closeWindow).toHaveBeenCalledTimes(1);
  });
});

// ─── Corbeille actions ────────────────────────────────────────────────────────

describe("recycle-bin buildMenu — Corbeille actions", () => {
  it("'restore-all' dispatches the 'restore-all' command", () => {
    const ctx = makeMenuContext();
    const bin = findGroup(buildMenu(ctx), "bin");
    getAction(bin?.items ?? [], "restore-all").run();
    expect(ctx.command).toHaveBeenCalledWith("restore-all");
  });

  it("'empty-bin' dispatches the same 'empty' command as the Fichier menu's 'empty'", () => {
    const ctx = makeMenuContext();
    const bin = findGroup(buildMenu(ctx), "bin");
    getAction(bin?.items ?? [], "empty-bin").run();
    expect(ctx.command).toHaveBeenCalledWith("empty");
  });

  it("'open-folders' opens the folders app", () => {
    const ctx = makeMenuContext();
    const bin = findGroup(buildMenu(ctx), "bin");
    getAction(bin?.items ?? [], "open-folders").run();
    expect(ctx.openApp).toHaveBeenCalledWith("folders");
  });
});
