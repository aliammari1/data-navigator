import { describe, expect, it } from "vitest";

import { buildMenu } from "@/features/desktop/core/menu/apps/settings";

import { findGroup, getAction, makeMenuContext } from "./menu-context";

/**
 * Behavioral test suite for the "settings" app menu (Paramètres).
 *
 * `buildMenu` is a pure function of {@link MenuContext} → declarative menu
 * data. Each test asserts both the declared shape and the real ctx action
 * wired to `run()` — in particular that every "Sections" item jumps to the
 * right tab via `ctx.setActivePage`.
 */

// ─── Menu shape ───────────────────────────────────────────────────────────────

describe("settings buildMenu — shape", () => {
  it("declares exactly the Fichier, Sections and Aide groups, in order", () => {
    const groups = buildMenu(makeMenuContext());
    expect(groups.map((g) => g.id)).toEqual(["file", "settings", "help"]);
  });

  it("labels the groups in French", () => {
    const groups = buildMenu(makeMenuContext());
    expect(findGroup(groups, "file")?.label).toBe("Fichier");
    expect(findGroup(groups, "settings")?.label).toBe("Sections");
    expect(findGroup(groups, "help")?.label).toBe("Aide");
  });

  it("declares the expected Fichier item ids in order", () => {
    const groups = buildMenu(makeMenuContext());
    const file = findGroup(groups, "file");
    expect(file?.items.map((i) => i.id)).toEqual([
      "new-window",
      "sep-reset",
      "reset",
      "sep-close",
      "close",
    ]);
  });

  it("declares all ten Sections item ids in order", () => {
    const groups = buildMenu(makeMenuContext());
    const settings = findGroup(groups, "settings");
    expect(settings?.items.map((i) => i.id)).toEqual([
      "go-appearance",
      "go-data",
      "go-performance",
      "go-ai",
      "go-account",
      "go-notifications",
      "go-storage",
      "go-branding",
      "go-shortcuts",
      "go-about",
    ]);
  });

  it("declares the Aide item", () => {
    const groups = buildMenu(makeMenuContext());
    const help = findGroup(groups, "help");
    expect(help?.items.map((i) => i.id)).toEqual(["open-help"]);
  });

  it("marks both 'reset' and 'close' as danger actions", () => {
    const groups = buildMenu(makeMenuContext());
    const file = findGroup(groups, "file");
    expect(getAction(file?.items ?? [], "reset").danger).toBe(true);
    expect(getAction(file?.items ?? [], "close").danger).toBe(true);
  });
});

// ─── Fichier actions ──────────────────────────────────────────────────────────

describe("settings buildMenu — Fichier actions", () => {
  it("'new-window' opens a forced-new settings window", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "new-window").run();
    expect(ctx.openApp).toHaveBeenCalledWith("settings", { forceNew: true });
  });

  it("'reset' dispatches the 'reset' command", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "reset").run();
    expect(ctx.command).toHaveBeenCalledWith("reset");
  });

  it("'close' closes the focused window", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "close").run();
    expect(ctx.closeWindow).toHaveBeenCalledTimes(1);
  });
});

// ─── Sections navigation ──────────────────────────────────────────────────────

describe("settings buildMenu — Sections navigation", () => {
  it.each([
    ["go-appearance", "appearance"],
    ["go-data", "data"],
    ["go-performance", "performance"],
    ["go-ai", "ai"],
    ["go-account", "account"],
    ["go-notifications", "notifications"],
    ["go-storage", "storage"],
    ["go-branding", "branding"],
    ["go-shortcuts", "shortcuts"],
    ["go-about", "about"],
  ] as const)("'%s' calls ctx.setActivePage('%s')", (itemId, pageId) => {
    const ctx = makeMenuContext();
    const settings = findGroup(buildMenu(ctx), "settings");
    getAction(settings?.items ?? [], itemId).run();
    expect(ctx.setActivePage).toHaveBeenCalledWith(pageId);
  });
});

// ─── Aide actions ─────────────────────────────────────────────────────────────

describe("settings buildMenu — Aide actions", () => {
  it("'open-help' opens the help app", () => {
    const ctx = makeMenuContext();
    const help = findGroup(buildMenu(ctx), "help");
    getAction(help?.items ?? [], "open-help").run();
    expect(ctx.openApp).toHaveBeenCalledWith("help");
  });
});
