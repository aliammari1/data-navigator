import { describe, expect, it } from "vitest";

import { buildMenu } from "@/features/desktop/core/menu/apps/deep-analytics";
import { findGroup, getAction, makeMenuContext } from "./test-helpers";

/**
 * Behavioral tests for the "deep-analytics" app menu builder ("Analyses approfondies").
 *
 * The "Analyse" group's four tab-navigation items each carry a `disabled` flag
 * driven by `ctx.activePageId`, exercised the same way as ai-briefing's page
 * navigation.
 */

describe("deep-analytics buildMenu — shape", () => {
  it("declares the file, analyse, and help groups in order", () => {
    const groups = buildMenu(makeMenuContext());
    expect(groups.map((g) => g.id)).toEqual(["file", "analyse", "help"]);
  });

  it("labels the groups in French", () => {
    const groups = buildMenu(makeMenuContext());
    expect(findGroup(groups, "file")?.label).toBe("Fichier");
    expect(findGroup(groups, "analyse")?.label).toBe("Analyse");
    expect(findGroup(groups, "help")?.label).toBe("Aide");
  });
});

describe("deep-analytics buildMenu — file group", () => {
  it("run() on 'new-window' opens a forced new deep-analytics window", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "file")!.items, "new-window").run();
    expect(ctx.openApp).toHaveBeenCalledWith("deep-analytics", { forceNew: true });
  });

  it("run() on 'import-data' opens the upload app", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "file")!.items, "import-data").run();
    expect(ctx.openApp).toHaveBeenCalledWith("upload");
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

describe("deep-analytics buildMenu — analyse tab navigation", () => {
  it.each([
    ["go-cohort", "cohort"],
    ["go-attribution", "attribution"],
    ["go-clusters", "clusters"],
    ["go-periods", "periods"],
  ])("run() on '%s' switches the active page to '%s'", (itemId, pageId) => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "analyse")!.items, itemId).run();
    expect(ctx.setActivePage).toHaveBeenCalledWith(pageId);
  });

  it("disables exactly the currently active tab's item ('clusters')", () => {
    const groups = buildMenu(makeMenuContext({ activePageId: "clusters" }));
    const analyseItems = findGroup(groups, "analyse")!.items;
    expect(getAction(analyseItems, "go-clusters").disabled).toBe(true);
    expect(getAction(analyseItems, "go-cohort").disabled).toBe(false);
    expect(getAction(analyseItems, "go-attribution").disabled).toBe(false);
    expect(getAction(analyseItems, "go-periods").disabled).toBe(false);
  });

  it("does not disable any tab item when no page is active", () => {
    const groups = buildMenu(makeMenuContext({ activePageId: null }));
    const analyseItems = findGroup(groups, "analyse")!.items;
    for (const id of ["go-cohort", "go-attribution", "go-clusters", "go-periods"]) {
      expect(getAction(analyseItems, id).disabled).toBe(false);
    }
  });
});

describe("deep-analytics buildMenu — analyse related-app shortcuts", () => {
  it("run() on 'open-forecast' opens the forecast app", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "analyse")!.items, "open-forecast").run();
    expect(ctx.openApp).toHaveBeenCalledWith("forecast");
  });

  it("run() on 'open-ai-analysis' opens the ai-analysis app", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "analyse")!.items, "open-ai-analysis").run();
    expect(ctx.openApp).toHaveBeenCalledWith("ai-analysis");
  });

  it("run() on 'ask-moudir' asks Moudir with a deep-analytics-specific prompt", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "analyse")!.items, "ask-moudir").run();
    expect(ctx.askMoudir).toHaveBeenCalledWith(expect.stringContaining("clustering"));
  });
});

describe("deep-analytics buildMenu — help group", () => {
  it("run() on 'explain-deep-analytics' asks Moudir a simplified explanation prompt", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "help")!.items, "explain-deep-analytics").run();
    expect(ctx.askMoudir).toHaveBeenCalledWith(expect.stringContaining("termes simples"));
  });
});
