import { describe, expect, it } from "vitest";

import { buildMenu } from "@/features/desktop/core/menu/apps/data-browser";
import { findGroup, getAction, makeMenuContext } from "./test-helpers";

/**
 * Behavioral tests for the "data-browser" app menu builder ("Explorateur").
 *
 * This is the largest menu in the wave (three groups, a nested export
 * submenu with three formats, and page navigation via `ctx.setActivePage`).
 */

describe("data-browser buildMenu — shape", () => {
  it("declares the file, data, and view groups in order", () => {
    const groups = buildMenu(makeMenuContext());
    expect(groups.map((g) => g.id)).toEqual(["file", "data", "view"]);
  });

  it("labels the groups in French", () => {
    const groups = buildMenu(makeMenuContext());
    expect(findGroup(groups, "file")?.label).toBe("Fichier");
    expect(findGroup(groups, "data")?.label).toBe("Données");
    expect(findGroup(groups, "view")?.label).toBe("Affichage");
  });

  it("nests the three export formats under the 'export' submenu", () => {
    const groups = buildMenu(makeMenuContext());
    const fileItems = findGroup(groups, "file")!.items;
    const submenu = fileItems.find((i) => i.id === "export");
    expect(submenu?.kind).toBe("submenu");
    expect(submenu && "items" in submenu ? submenu.items.map((i) => i.id) : []).toEqual([
      "export-csv",
      "export-xlsx",
      "export-json",
    ]);
  });
});

describe("data-browser buildMenu — file group", () => {
  it("run() on 'new-window' opens a forced new data-browser window", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "file")!.items, "new-window").run();
    expect(ctx.openApp).toHaveBeenCalledWith("data-browser", { forceNew: true });
  });

  it("run() on 'import-inline' sends the import command", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "file")!.items, "import-inline").run();
    expect(ctx.command).toHaveBeenCalledWith("import");
  });

  it("run() on 'open-upload' opens the upload app", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "file")!.items, "open-upload").run();
    expect(ctx.openApp).toHaveBeenCalledWith("upload");
  });

  it.each([
    ["export-csv", "csv"],
    ["export-xlsx", "xlsx"],
    ["export-json", "json"],
  ])("run() on the nested '%s' item sends export with kind '%s'", (itemId, kind) => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "file")!.items, itemId).run();
    expect(ctx.command).toHaveBeenCalledWith("export", { kind });
  });

  it("run() on 'refresh' sends the refresh command", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "file")!.items, "refresh").run();
    expect(ctx.command).toHaveBeenCalledWith("refresh");
  });

  it("run() on 'close' closes the window and is danger-styled", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    const item = getAction(findGroup(groups, "file")!.items, "close");
    item.run();
    expect(ctx.closeWindow).toHaveBeenCalledTimes(1);
    expect(item.danger).toBe(true);
  });
});

describe("data-browser buildMenu — data group view switching", () => {
  it.each([
    ["view-table", "table"],
    ["view-cards", "cards"],
    ["view-analytics", "analytics"],
    ["view-sql", "sql"],
  ])("run() on '%s' switches the active page to '%s'", (itemId, pageId) => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "data")!.items, itemId).run();
    expect(ctx.setActivePage).toHaveBeenCalledWith(pageId);
  });

  it("run() on 'toggle-filters' sends the toggle-filters command", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "data")!.items, "toggle-filters").run();
    expect(ctx.command).toHaveBeenCalledWith("toggle-filters");
  });

  it("run() on 'toggle-columns' sends the toggle-columns command", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "data")!.items, "toggle-columns").run();
    expect(ctx.command).toHaveBeenCalledWith("toggle-columns");
  });

  it("run() on 'run-sql' sends the run-sql command", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "data")!.items, "run-sql").run();
    expect(ctx.command).toHaveBeenCalledWith("run-sql");
  });

  it("run() on 'open-transform' opens the transform app", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "data")!.items, "open-transform").run();
    expect(ctx.openApp).toHaveBeenCalledWith("transform");
  });

  it("run() on 'open-lineage' opens the lineage app", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "data")!.items, "open-lineage").run();
    expect(ctx.openApp).toHaveBeenCalledWith("lineage");
  });

  it("run() on 'ask-moudir' asks Moudir with an explorer-specific prompt", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "data")!.items, "ask-moudir").run();
    expect(ctx.askMoudir).toHaveBeenCalledWith(expect.stringContaining("Explorateur"));
  });
});

describe("data-browser buildMenu — view group toggles", () => {
  it.each([
    ["toggle-row-numbers", "toggle-row-numbers"],
    ["toggle-compact", "toggle-compact"],
    ["toggle-zebra", "toggle-zebra"],
    ["toggle-heatmap", "toggle-heatmap"],
    ["toggle-fullscreen", "toggle-fullscreen"],
  ])("run() on '%s' sends the '%s' command", (itemId, commandId) => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "view")!.items, itemId).run();
    expect(ctx.command).toHaveBeenCalledWith(commandId);
  });
});
