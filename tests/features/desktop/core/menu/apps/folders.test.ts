import { describe, expect, it } from "vitest";

import { buildMenu } from "@/features/desktop/core/menu/apps/folders";
import { findGroup, findItem, makeMenuContext, runAction } from "./_helpers";

/**
 * Behavioral test suite for the "folders" (Catalogue) app's menu builder.
 *
 * `buildMenu` is a pure function of {@link MenuContext}: it must return the
 * declared groups/items, and each item's callback must invoke the correct
 * context method with the correct arguments.
 */

describe("folders buildMenu — structure", () => {
  it("returns the file, catalogue and view groups in order", () => {
    const groups = buildMenu(makeMenuContext());
    expect(groups.map((g) => g.id)).toEqual(["file", "catalogue", "view"]);
  });

  it("labels the groups in French", () => {
    const groups = buildMenu(makeMenuContext());
    expect(findGroup(groups, "file")?.label).toBe("Fichier");
    expect(findGroup(groups, "catalogue")?.label).toBe("Catalogue");
    expect(findGroup(groups, "view")?.label).toBe("Affichage");
  });

  it("nests layout, sort and filter as submenus under the view group", () => {
    const groups = buildMenu(makeMenuContext());
    const view = findGroup(groups, "view")!;
    const submenuIds = view.items.filter((i) => i.kind === "submenu").map((i) => i.id);
    expect(submenuIds).toEqual(["layout", "sort", "filter"]);
  });
});

describe("folders buildMenu — file group actions", () => {
  it("new-folder runs ctx.command('new-folder')", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "file")!.items, "new-folder");
    expect(ctx.command).toHaveBeenCalledWith("new-folder");
  });

  it("import runs ctx.command('import')", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "file")!.items, "import");
    expect(ctx.command).toHaveBeenCalledWith("import");
  });

  it("auto-organize runs ctx.command('auto-organize')", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "file")!.items, "auto-organize");
    expect(ctx.command).toHaveBeenCalledWith("auto-organize");
  });

  it("close is a danger action that runs ctx.closeWindow()", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    const file = findGroup(groups, "file")!;
    const close = findItem(file.items, "close");
    expect(close?.kind === undefined || close?.kind === "action").toBe(true);
    expect((close as { danger?: boolean }).danger).toBe(true);
    runAction(file.items, "close");
    expect(ctx.closeWindow).toHaveBeenCalledTimes(1);
  });
});

describe("folders buildMenu — catalogue group actions", () => {
  it("open-report opens the telecom app", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "catalogue")!.items, "open-report");
    expect(ctx.openApp).toHaveBeenCalledWith("telecom");
  });

  it("ask-moudir asks Moudir to help organize the catalogue", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "catalogue")!.items, "ask-moudir");
    expect(ctx.askMoudir).toHaveBeenCalledWith(
      "Aide-moi à organiser et explorer mon catalogue de jeux de données.",
    );
  });
});

describe("folders buildMenu — view group: layout submenu", () => {
  it("layout-grid runs ctx.command('layout', { mode: 'grid' })", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "view")!.items, "layout-grid");
    expect(ctx.command).toHaveBeenCalledWith("layout", { mode: "grid" });
  });

  it("layout-list runs ctx.command('layout', { mode: 'list' })", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "view")!.items, "layout-list");
    expect(ctx.command).toHaveBeenCalledWith("layout", { mode: "list" });
  });
});

describe("folders buildMenu — view group: sort submenu", () => {
  it.each([
    ["sort-name", "name"],
    ["sort-size", "size"],
    ["sort-updated", "updated"],
    ["sort-quality", "quality"],
  ])("%s runs ctx.command('sort', { key: '%s' })", (id, key) => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "view")!.items, id);
    expect(ctx.command).toHaveBeenCalledWith("sort", { key });
  });
});

describe("folders buildMenu — view group: filter submenu", () => {
  it.each([
    ["filter-all", "all"],
    ["filter-csv", "csv"],
    ["filter-parquet", "parquet"],
    ["filter-unclassified", "unclassified"],
    ["filter-low-quality", "low-quality"],
    ["filter-recent", "recent"],
  ])("%s runs ctx.command('filter', { filter: '%s' })", (id, filter) => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "view")!.items, id);
    expect(ctx.command).toHaveBeenCalledWith("filter", { filter });
  });
});
