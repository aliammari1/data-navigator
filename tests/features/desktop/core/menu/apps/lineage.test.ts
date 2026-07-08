import { describe, expect, it } from "vitest";

import { buildMenu } from "@/features/desktop/core/menu/apps/lineage";
import { findGroup, findItem, makeMenuContext, runAction } from "./_helpers";

/**
 * Behavioral test suite for the "lineage" (Lignage) app's menu builder.
 */

describe("lineage buildMenu — structure", () => {
  it("returns the file, lineage and help groups in order", () => {
    const groups = buildMenu(makeMenuContext());
    expect(groups.map((g) => g.id)).toEqual(["file", "lineage", "help"]);
  });

  it("labels the groups in French", () => {
    const groups = buildMenu(makeMenuContext());
    expect(findGroup(groups, "file")?.label).toBe("Fichier");
    expect(findGroup(groups, "lineage")?.label).toBe("Lignage");
    expect(findGroup(groups, "help")?.label).toBe("Aide");
  });
});

describe("lineage buildMenu — file group actions", () => {
  it("new-window opens lineage in a forced-new window", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "file")!.items, "new-window");
    expect(ctx.openApp).toHaveBeenCalledWith("lineage", { forceNew: true });
  });

  it("import-data opens the upload app", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "file")!.items, "import-data");
    expect(ctx.openApp).toHaveBeenCalledWith("upload");
  });

  it("refresh runs ctx.command('refresh')", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "file")!.items, "refresh");
    expect(ctx.command).toHaveBeenCalledWith("refresh");
  });

  it("close is a danger action that runs ctx.closeWindow()", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    const close = findItem(findGroup(groups, "file")!.items, "close");
    expect((close as { danger?: boolean }).danger).toBe(true);
    runAction(findGroup(groups, "file")!.items, "close");
    expect(ctx.closeWindow).toHaveBeenCalledTimes(1);
  });
});

describe("lineage buildMenu — lineage group: view navigation", () => {
  it.each([
    ["go-graph", "graph"],
    ["go-table", "table"],
    ["go-impact", "impact"],
    ["go-columns", "columns"],
  ])("%s runs ctx.setActivePage('%s')", (id, pageId) => {
    const ctx = makeMenuContext({ activePageId: null });
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "lineage")!.items, id);
    expect(ctx.setActivePage).toHaveBeenCalledWith(pageId);
  });

  it("disables the item matching the currently active page", () => {
    const ctx = makeMenuContext({ activePageId: "table" });
    const groups = buildMenu(ctx);
    const lineage = findGroup(groups, "lineage")!;
    const table = findItem(lineage.items, "go-table");
    const graph = findItem(lineage.items, "go-graph");
    expect((table as { disabled?: boolean }).disabled).toBe(true);
    expect((graph as { disabled?: boolean }).disabled).toBe(false);
  });

  it("disables no view item when activePageId matches none of them", () => {
    const ctx = makeMenuContext({ activePageId: "unrelated" });
    const groups = buildMenu(ctx);
    const lineage = findGroup(groups, "lineage")!;
    for (const id of ["go-graph", "go-table", "go-impact", "go-columns"]) {
      const item = findItem(lineage.items, id);
      expect((item as { disabled?: boolean }).disabled).toBe(false);
    }
  });
});

describe("lineage buildMenu — lineage group: related apps", () => {
  it("open-transform opens the transform app", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "lineage")!.items, "open-transform");
    expect(ctx.openApp).toHaveBeenCalledWith("transform");
  });

  it("open-reconciliation opens the reconciliation app", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "lineage")!.items, "open-reconciliation");
    expect(ctx.openApp).toHaveBeenCalledWith("reconciliation");
  });
});

describe("lineage buildMenu — help group actions", () => {
  it("explain-lineage asks Moudir to explain data lineage", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "help")!.items, "explain-lineage");
    expect(ctx.askMoudir).toHaveBeenCalledWith(
      "Explique en termes simples le lignage de données : comment lire le graphe des sources, transformations et sorties, l'analyse d'impact et le lignage au niveau des colonnes.",
    );
  });
});
