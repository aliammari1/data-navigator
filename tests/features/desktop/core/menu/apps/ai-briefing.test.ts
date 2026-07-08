import { describe, expect, it } from "vitest";

import { buildMenu } from "@/features/desktop/core/menu/apps/ai-briefing";
import { findGroup, getAction, makeMenuContext } from "./test-helpers";

/**
 * Behavioral tests for the "ai-briefing" app menu builder.
 *
 * The "Briefing" group's four page-navigation items are generated from an
 * internal PAGES constant via `.map`, so these tests both pin down the
 * generated ids/labels/order and exercise the `disabled` flag that depends on
 * `ctx.activePageId`.
 */

describe("ai-briefing buildMenu — shape", () => {
  it("declares the file and briefing groups in order", () => {
    const groups = buildMenu(makeMenuContext());
    expect(groups.map((g) => g.id)).toEqual(["file", "briefing"]);
  });

  it("generates the four page-navigation items in the declared PAGES order", () => {
    const groups = buildMenu(makeMenuContext());
    const briefingItems = findGroup(groups, "briefing")!.items;
    const gotoIds = briefingItems.filter((i) => i.id.startsWith("goto-")).map((i) => i.id);
    expect(gotoIds).toEqual(["goto-briefing", "goto-anomaly", "goto-action", "goto-story"]);
  });

  it("labels each generated page item with its French page label", () => {
    const groups = buildMenu(makeMenuContext());
    const briefingItems = findGroup(groups, "briefing")!.items;
    const byId = (id: string) => briefingItems.find((i) => i.id === id);
    expect(byId("goto-briefing")?.label).toBe("Briefing quotidien");
    expect(byId("goto-anomaly")?.label).toBe("Rapport d'anomalies");
    expect(byId("goto-action")?.label).toBe("Plan d'action");
    expect(byId("goto-story")?.label).toBe("Récit des données");
  });
});

describe("ai-briefing buildMenu — file group", () => {
  it("run() on 'new-window' opens a forced new ai-briefing window", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "file")!.items, "new-window").run();
    expect(ctx.openApp).toHaveBeenCalledWith("ai-briefing", { forceNew: true });
  });

  it("run() on 'refresh' sends the refresh command", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "file")!.items, "refresh").run();
    expect(ctx.command).toHaveBeenCalledWith("refresh");
  });

  it("run() on 'close' closes the window", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "file")!.items, "close").run();
    expect(ctx.closeWindow).toHaveBeenCalledTimes(1);
  });
});

describe("ai-briefing buildMenu — page navigation disabled state", () => {
  it("does not disable any page item when no page is active", () => {
    const groups = buildMenu(makeMenuContext({ activePageId: null }));
    const briefingItems = findGroup(groups, "briefing")!.items;
    const gotoIds = briefingItems.filter((i) => i.id.startsWith("goto-")).map((i) => i.id);
    for (const id of gotoIds) {
      expect(getAction(briefingItems, id).disabled).toBe(false);
    }
  });

  it("disables exactly the currently active page's item ('anomaly')", () => {
    const groups = buildMenu(makeMenuContext({ activePageId: "anomaly" }));
    const briefingItems = findGroup(groups, "briefing")!.items;
    expect(getAction(briefingItems, "goto-anomaly").disabled).toBe(true);
    expect(getAction(briefingItems, "goto-briefing").disabled).toBe(false);
    expect(getAction(briefingItems, "goto-action").disabled).toBe(false);
    expect(getAction(briefingItems, "goto-story").disabled).toBe(false);
  });

  it("run() on a page item switches the active page via ctx.setActivePage", () => {
    const ctx = makeMenuContext({ activePageId: "briefing" });
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "briefing")!.items, "goto-story").run();
    expect(ctx.setActivePage).toHaveBeenCalledWith("story");
  });
});

describe("ai-briefing buildMenu — model + Moudir actions", () => {
  it("run() on 'warm-model' sends the warm command", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "briefing")!.items, "warm-model").run();
    expect(ctx.command).toHaveBeenCalledWith("warm");
  });

  it("run() on 'ask-moudir' asks Moudir with a briefing-specific prompt", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "briefing")!.items, "ask-moudir").run();
    expect(ctx.askMoudir).toHaveBeenCalledWith(expect.stringContaining("briefing"));
  });
});
