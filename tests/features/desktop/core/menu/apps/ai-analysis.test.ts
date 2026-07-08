import { describe, expect, it } from "vitest";

import { buildMenu } from "@/features/desktop/core/menu/apps/ai-analysis";
import { findGroup, getAction, makeMenuContext } from "./test-helpers";

/**
 * Behavioral tests for the "ai-analysis" app menu builder ("Analyse statistique").
 */

describe("ai-analysis buildMenu — shape", () => {
  it("declares the file and analyze groups in order", () => {
    const groups = buildMenu(makeMenuContext());
    expect(groups.map((g) => g.id)).toEqual(["file", "analyze"]);
  });

  it("labels the groups in French", () => {
    const groups = buildMenu(makeMenuContext());
    expect(findGroup(groups, "file")?.label).toBe("Fichier");
    expect(findGroup(groups, "analyze")?.label).toBe("Analyse");
  });

  it("nests the two export formats under the 'export' submenu", () => {
    const groups = buildMenu(makeMenuContext());
    const fileItems = findGroup(groups, "file")!.items;
    const exportSubmenu = fileItems.find((i) => i.id === "export");
    expect(exportSubmenu?.kind).toBe("submenu");
    expect(exportSubmenu && "items" in exportSubmenu ? exportSubmenu.items.map((i) => i.id) : []).toEqual([
      "export-xlsx",
      "export-pdf",
    ]);
  });
});

describe("ai-analysis buildMenu — file group", () => {
  it("run() on 'new-window' opens a forced new ai-analysis window", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "file")!.items, "new-window").run();
    expect(ctx.openApp).toHaveBeenCalledWith("ai-analysis", { forceNew: true });
  });

  it("run() on 'import-data' opens the upload app", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "file")!.items, "import-data").run();
    expect(ctx.openApp).toHaveBeenCalledWith("upload");
  });

  it("run() on the nested 'export-xlsx' item sends the xlsx export command", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "file")!.items, "export-xlsx").run();
    expect(ctx.command).toHaveBeenCalledWith("export", { kind: "xlsx" });
  });

  it("run() on the nested 'export-pdf' item sends the pdf export command", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "file")!.items, "export-pdf").run();
    expect(ctx.command).toHaveBeenCalledWith("export", { kind: "pdf" });
  });

  it("run() on 'close' closes the window", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "file")!.items, "close").run();
    expect(ctx.closeWindow).toHaveBeenCalledTimes(1);
  });

  it("marks the 'close' item as danger-styled", () => {
    const groups = buildMenu(makeMenuContext());
    expect(getAction(findGroup(groups, "file")!.items, "close").danger).toBe(true);
  });
});

describe("ai-analysis buildMenu — analyze group", () => {
  it("run() on 'run-analysis' sends the run command", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "analyze")!.items, "run-analysis").run();
    expect(ctx.command).toHaveBeenCalledWith("run");
  });

  it("run() on 'export-xlsx-quick' sends the xlsx export command directly from the Analyse menu", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "analyze")!.items, "export-xlsx-quick").run();
    expect(ctx.command).toHaveBeenCalledWith("export", { kind: "xlsx" });
  });

  it("run() on 'export-pdf-quick' sends the pdf export command directly from the Analyse menu", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "analyze")!.items, "export-pdf-quick").run();
    expect(ctx.command).toHaveBeenCalledWith("export", { kind: "pdf" });
  });

  it("run() on 'open-forecast' opens the forecast app", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "analyze")!.items, "open-forecast").run();
    expect(ctx.openApp).toHaveBeenCalledWith("forecast");
  });

  it("run() on 'ask-moudir' asks Moudir with a statistics-specific prompt", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "analyze")!.items, "ask-moudir").run();
    expect(ctx.askMoudir).toHaveBeenCalledWith(expect.stringContaining("statistiques"));
  });
});
