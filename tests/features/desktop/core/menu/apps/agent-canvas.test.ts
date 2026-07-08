import { describe, expect, it } from "vitest";

import { buildMenu } from "@/features/desktop/core/menu/apps/agent-canvas";
import { findGroup, getAction, makeMenuContext } from "./test-helpers";

/**
 * Behavioral tests for the "agent-canvas" app menu builder.
 *
 * `buildMenu` is a pure function of a `MenuContext`; these tests verify both
 * the declared shape (group/item ids present) and the actual wiring (each
 * item's `run()` calls the correct context method with the correct args).
 */

describe("agent-canvas buildMenu — shape", () => {
  it("declares the file, view, and agent groups in order", () => {
    const groups = buildMenu(makeMenuContext());
    expect(groups.map((g) => g.id)).toEqual(["file", "view", "agent"]);
  });

  it("labels the groups in French", () => {
    const groups = buildMenu(makeMenuContext());
    expect(findGroup(groups, "file")?.label).toBe("Fichier");
    expect(findGroup(groups, "view")?.label).toBe("Affichage");
    expect(findGroup(groups, "agent")?.label).toBe("Agent");
  });
});

describe("agent-canvas buildMenu — file group", () => {
  it("run() on 'new-window' opens a new forced agent-canvas window", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "file")!.items, "new-window").run();
    expect(ctx.openApp).toHaveBeenCalledWith("agent-canvas", { forceNew: true });
  });

  it("run() on 'reset' sends the reset command", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "file")!.items, "reset").run();
    expect(ctx.command).toHaveBeenCalledWith("reset");
  });

  it("run() on 'close' closes the window", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "file")!.items, "close").run();
    expect(ctx.closeWindow).toHaveBeenCalledTimes(1);
  });
});

describe("agent-canvas buildMenu — view group panel toggles", () => {
  it("run() on 'toggle-sql' toggles the SQL panel", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "view")!.items, "toggle-sql").run();
    expect(ctx.command).toHaveBeenCalledWith("togglePanel", { panel: "sql" });
  });

  it("run() on 'toggle-graph' toggles the agent-graph panel", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "view")!.items, "toggle-graph").run();
    expect(ctx.command).toHaveBeenCalledWith("togglePanel", { panel: "graph" });
  });

  it("run() on 'toggle-narrative' toggles the narrative panel", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "view")!.items, "toggle-narrative").run();
    expect(ctx.command).toHaveBeenCalledWith("togglePanel", { panel: "narrative" });
  });
});

describe("agent-canvas buildMenu — agent group", () => {
  it("run() on 'ask-moudir' asks Moudir with a canvas-specific prompt", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "agent")!.items, "ask-moudir").run();
    expect(ctx.askMoudir).toHaveBeenCalledTimes(1);
    expect(ctx.askMoudir).toHaveBeenCalledWith(expect.stringContaining("agent canvas"));
  });

  it("run() on 'open-analysis' opens the ai-analysis app", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "agent")!.items, "open-analysis").run();
    expect(ctx.openApp).toHaveBeenCalledWith("ai-analysis");
  });
});
