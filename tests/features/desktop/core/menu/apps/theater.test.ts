import { describe, expect, it } from "vitest";

import { buildMenu } from "@/features/desktop/core/menu/apps/theater";

import { findGroup, getAction, getSubmenu, makeMenuContext } from "./menu-context";

/**
 * Behavioral test suite for the "theater" app menu (Théâtre Analytique).
 *
 * Unlike the other app menu modules, `buildMenu` here is shaped by
 * `ctx.pages`: it maps each registered scene into a "Aller à la scène"
 * submenu item, and only renders that submenu (+ its separator) when at
 * least one scene is registered. Both branches are covered.
 */

// ─── Menu shape (no scenes registered) ───────────────────────────────────────

describe("theater buildMenu — shape (no scenes)", () => {
  it("declares exactly the Fichier and Théâtre groups, in order", () => {
    const groups = buildMenu(makeMenuContext({ pages: [] }));
    expect(groups.map((g) => g.id)).toEqual(["file", "theater"]);
  });

  it("labels the groups in French", () => {
    const groups = buildMenu(makeMenuContext({ pages: [] }));
    expect(findGroup(groups, "file")?.label).toBe("Fichier");
    expect(findGroup(groups, "theater")?.label).toBe("Théâtre");
  });

  it("declares the expected Fichier item ids in order, including the 'export' submenu", () => {
    const groups = buildMenu(makeMenuContext({ pages: [] }));
    const file = findGroup(groups, "file");
    expect(file?.items.map((i) => i.id)).toEqual([
      "new-window",
      "import",
      "sep-save",
      "save",
      "sep-export",
      "export",
      "sep-close",
      "close",
    ]);
  });

  it("declares the two export formats inside the 'export' submenu, in order", () => {
    const groups = buildMenu(makeMenuContext({ pages: [] }));
    const file = findGroup(groups, "file");
    const exportMenu = getSubmenu(file?.items ?? [], "export");
    expect(exportMenu.items.map((i) => i.id)).toEqual(["export-pptx", "export-pdf"]);
  });

  it("declares only the base Théâtre items (no scenes submenu) when ctx.pages is empty", () => {
    const groups = buildMenu(makeMenuContext({ pages: [] }));
    const theater = findGroup(groups, "theater");
    expect(theater?.items.map((i) => i.id)).toEqual([
      "narrate",
      "sep-mode",
      "mode-explore",
      "mode-present",
    ]);
  });

  it("marks 'close' as a danger action", () => {
    const groups = buildMenu(makeMenuContext({ pages: [] }));
    const file = findGroup(groups, "file");
    expect(getAction(file?.items ?? [], "close").danger).toBe(true);
  });
});

// ─── Menu shape (scenes registered) ───────────────────────────────────────────

describe("theater buildMenu — shape (scenes registered)", () => {
  const pages = [
    { id: "intro", label: "Introduction" },
    { id: "trends", label: "Tendances" },
  ];

  it("appends a 'sep-scenes' separator and a 'scenes' submenu after the base items", () => {
    const groups = buildMenu(makeMenuContext({ pages }));
    const theater = findGroup(groups, "theater");
    expect(theater?.items.map((i) => i.id)).toEqual([
      "narrate",
      "sep-mode",
      "mode-explore",
      "mode-present",
      "sep-scenes",
      "scenes",
    ]);
  });

  it("labels the scenes submenu 'Aller à la scène'", () => {
    const groups = buildMenu(makeMenuContext({ pages }));
    const theater = findGroup(groups, "theater");
    const scenesMenu = getSubmenu(theater?.items ?? [], "scenes");
    expect(scenesMenu.label).toBe("Aller à la scène");
  });

  it("maps each page into a scene item with a 'scene-<id>' id and the page's label", () => {
    const groups = buildMenu(makeMenuContext({ pages }));
    const theater = findGroup(groups, "theater");
    const scenesMenu = getSubmenu(theater?.items ?? [], "scenes");
    expect(scenesMenu.items.map((i) => i.id)).toEqual(["scene-intro", "scene-trends"]);
    expect(scenesMenu.items.map((i) => i.label)).toEqual(["Introduction", "Tendances"]);
  });

  it("a scene item's run() calls ctx.setActivePage with that page's id", () => {
    const ctx = makeMenuContext({ pages });
    const theater = findGroup(buildMenu(ctx), "theater");
    const scenesMenu = getSubmenu(theater?.items ?? [], "scenes");
    getAction(scenesMenu.items, "scene-trends").run();
    expect(ctx.setActivePage).toHaveBeenCalledWith("trends");
  });
});

// ─── Fichier actions ──────────────────────────────────────────────────────────

describe("theater buildMenu — Fichier actions", () => {
  it("'new-window' opens a forced-new theater window", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "new-window").run();
    expect(ctx.openApp).toHaveBeenCalledWith("theater", { forceNew: true });
  });

  it("'import' opens the upload app", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "import").run();
    expect(ctx.openApp).toHaveBeenCalledWith("upload");
  });

  it("'save' dispatches the 'save' command", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "save").run();
    expect(ctx.command).toHaveBeenCalledWith("save");
  });

  it("'export-pptx' dispatches 'export' with kind pptx", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    const exportMenu = getSubmenu(file?.items ?? [], "export");
    getAction(exportMenu.items, "export-pptx").run();
    expect(ctx.command).toHaveBeenCalledWith("export", { kind: "pptx" });
  });

  it("'export-pdf' dispatches 'export' with kind pdf", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    const exportMenu = getSubmenu(file?.items ?? [], "export");
    getAction(exportMenu.items, "export-pdf").run();
    expect(ctx.command).toHaveBeenCalledWith("export", { kind: "pdf" });
  });

  it("'close' closes the focused window", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "close").run();
    expect(ctx.closeWindow).toHaveBeenCalledTimes(1);
  });
});

// ─── Théâtre actions ──────────────────────────────────────────────────────────

describe("theater buildMenu — Théâtre actions", () => {
  it("'narrate' dispatches the 'narrate' command", () => {
    const ctx = makeMenuContext();
    const theater = findGroup(buildMenu(ctx), "theater");
    getAction(theater?.items ?? [], "narrate").run();
    expect(ctx.command).toHaveBeenCalledWith("narrate");
  });

  it("'mode-explore' dispatches 'mode' with explore", () => {
    const ctx = makeMenuContext();
    const theater = findGroup(buildMenu(ctx), "theater");
    getAction(theater?.items ?? [], "mode-explore").run();
    expect(ctx.command).toHaveBeenCalledWith("mode", { mode: "explore" });
  });

  it("'mode-present' dispatches 'mode' with present", () => {
    const ctx = makeMenuContext();
    const theater = findGroup(buildMenu(ctx), "theater");
    getAction(theater?.items ?? [], "mode-present").run();
    expect(ctx.command).toHaveBeenCalledWith("mode", { mode: "present" });
  });
});
