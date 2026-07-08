import { describe, expect, it } from "vitest";

import { buildMenu } from "@/features/desktop/core/menu/apps/forecast";
import { findGroup, findItem, makeMenuContext, runAction } from "./_helpers";

/**
 * Behavioral test suite for the "forecast" (Prévisions) app's menu builder.
 */

describe("forecast buildMenu — structure", () => {
  it("returns the file and analyze groups in order", () => {
    const groups = buildMenu(makeMenuContext());
    expect(groups.map((g) => g.id)).toEqual(["file", "analyze"]);
  });

  it("labels the groups in French", () => {
    const groups = buildMenu(makeMenuContext());
    expect(findGroup(groups, "file")?.label).toBe("Fichier");
    expect(findGroup(groups, "analyze")?.label).toBe("Analyse");
  });

  it("nests the six forecast tabs under the 'go-to' submenu", () => {
    const groups = buildMenu(makeMenuContext());
    const analyze = findGroup(groups, "analyze")!;
    const goTo = findItem(analyze.items, "go-to");
    expect(goTo?.kind).toBe("submenu");
    const nested = (goTo as { items: { id: string }[] }).items;
    expect(nested.map((i) => i.id)).toEqual([
      "go-forecast",
      "go-intelligence",
      "go-simulator",
      "go-patterns",
      "go-risk",
      "go-scenarios",
    ]);
  });
});

describe("forecast buildMenu — file group actions", () => {
  it("new-window opens forecast in a forced-new window", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "file")!.items, "new-window");
    expect(ctx.openApp).toHaveBeenCalledWith("forecast", { forceNew: true });
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

describe("forecast buildMenu — analyze group: tab navigation", () => {
  it.each([
    ["go-forecast", "forecast"],
    ["go-intelligence", "intelligence"],
    ["go-simulator", "simulator"],
    ["go-patterns", "patterns"],
    ["go-risk", "risk"],
    ["go-scenarios", "scenarios"],
  ])("%s runs ctx.setActivePage('%s')", (id, pageId) => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "analyze")!.items, id);
    expect(ctx.setActivePage).toHaveBeenCalledWith(pageId);
  });
});

describe("forecast buildMenu — analyze group: cross-app jumps and Moudir", () => {
  it("open-deep-analytics opens the deep-analytics app", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "analyze")!.items, "open-deep-analytics");
    expect(ctx.openApp).toHaveBeenCalledWith("deep-analytics");
  });

  it("open-monitor opens the monitor app", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "analyze")!.items, "open-monitor");
    expect(ctx.openApp).toHaveBeenCalledWith("monitor");
  });

  it("ask-moudir asks Moudir about forecast risks", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "analyze")!.items, "ask-moudir");
    expect(ctx.askMoudir).toHaveBeenCalledWith(
      "Analyse les prévisions de transactions et de revenus pour demain et signale les risques principaux.",
    );
  });
});
