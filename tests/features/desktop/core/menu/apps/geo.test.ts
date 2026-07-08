import { describe, expect, it } from "vitest";

import { buildMenu } from "@/features/desktop/core/menu/apps/geo";
import { findGroup, findItem, makeMenuContext, runAction } from "./_helpers";

/**
 * Behavioral test suite for the "geo" (Géographie) app's menu builder.
 */

describe("geo buildMenu — structure", () => {
  it("returns the file and analyse groups in order", () => {
    const groups = buildMenu(makeMenuContext());
    expect(groups.map((g) => g.id)).toEqual(["file", "analyse"]);
  });

  it("labels the groups in French", () => {
    const groups = buildMenu(makeMenuContext());
    expect(findGroup(groups, "file")?.label).toBe("Fichier");
    expect(findGroup(groups, "analyse")?.label).toBe("Analyse");
  });

  it("lists all expected item ids in the file group", () => {
    const groups = buildMenu(makeMenuContext());
    const file = findGroup(groups, "file")!;
    const actionIds = file.items.filter((i) => i.id !== undefined).map((i) => i.id);
    expect(actionIds).toEqual(
      expect.arrayContaining([
        "new-window",
        "import",
        "export-pdf",
        "export-xlsx",
        "sep-export",
        "sep-close",
        "close",
      ]),
    );
  });
});

describe("geo buildMenu — file group actions", () => {
  it("new-window opens geo in a forced-new window", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "file")!.items, "new-window");
    expect(ctx.openApp).toHaveBeenCalledWith("geo", { forceNew: true });
  });

  it("import opens the upload app", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "file")!.items, "import");
    expect(ctx.openApp).toHaveBeenCalledWith("upload");
  });

  it("export-pdf runs ctx.command('export', { format: 'pdf' })", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "file")!.items, "export-pdf");
    expect(ctx.command).toHaveBeenCalledWith("export", { format: "pdf" });
  });

  it("export-xlsx runs ctx.command('export', { format: 'xlsx' })", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "file")!.items, "export-xlsx");
    expect(ctx.command).toHaveBeenCalledWith("export", { format: "xlsx" });
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

describe("geo buildMenu — analyse group actions", () => {
  it("view-map switches to the map page", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "analyse")!.items, "view-map");
    expect(ctx.setActivePage).toHaveBeenCalledWith("map");
  });

  it("view-flows switches to the flows page", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "analyse")!.items, "view-flows");
    expect(ctx.setActivePage).toHaveBeenCalledWith("flows");
  });

  it("view-distribution switches to the distribution page", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "analyse")!.items, "view-distribution");
    expect(ctx.setActivePage).toHaveBeenCalledWith("distribution");
  });

  it("generate-insights runs ctx.command('insights')", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "analyse")!.items, "generate-insights");
    expect(ctx.command).toHaveBeenCalledWith("insights");
  });

  it("ask-moudir asks Moudir about geographic breakdown", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "analyse")!.items, "ask-moudir");
    expect(ctx.askMoudir).toHaveBeenCalledWith(
      "Analyse la répartition géographique des transactions : régions, flux par canal et taux de succès.",
    );
  });
});
