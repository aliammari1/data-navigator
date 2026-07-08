import { describe, expect, it } from "vitest";

import { buildMenu } from "@/features/desktop/core/menu/apps/commander";
import { findGroup, getAction, makeMenuContext } from "./test-helpers";

/**
 * Behavioral tests for the "commander" app menu builder (Commandant IA).
 *
 * The "Piloter" group nests a five-app "open-app" submenu; those items are
 * exercised individually since each `run()` must target a distinct app id.
 */

describe("commander buildMenu — shape", () => {
  it("declares the file and piloter groups in order", () => {
    const groups = buildMenu(makeMenuContext());
    expect(groups.map((g) => g.id)).toEqual(["file", "piloter"]);
  });

  it("labels the groups in French", () => {
    const groups = buildMenu(makeMenuContext());
    expect(findGroup(groups, "file")?.label).toBe("Fichier");
    expect(findGroup(groups, "piloter")?.label).toBe("Piloter");
  });

  it("nests the five app shortcuts under the 'open-app' submenu", () => {
    const groups = buildMenu(makeMenuContext());
    const piloterItems = findGroup(groups, "piloter")!.items;
    const submenu = piloterItems.find((i) => i.id === "open-app");
    expect(submenu?.kind).toBe("submenu");
    expect(submenu && "items" in submenu ? submenu.items.map((i) => i.id) : []).toEqual([
      "open-telecom",
      "open-forecast",
      "open-geo",
      "open-data-browser",
      "open-moudir",
    ]);
  });
});

describe("commander buildMenu — file group", () => {
  it("run() on 'new-chat' resets the conversation via command", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "file")!.items, "new-chat").run();
    expect(ctx.command).toHaveBeenCalledWith("reset");
  });

  it("run() on 'new-window' opens a forced new commander window", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "file")!.items, "new-window").run();
    expect(ctx.openApp).toHaveBeenCalledWith("commander", { forceNew: true });
  });

  it("run() on 'close' closes the window", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "file")!.items, "close").run();
    expect(ctx.closeWindow).toHaveBeenCalledTimes(1);
  });
});

describe("commander buildMenu — piloter conversation controls", () => {
  it("run() on 'voice' toggles voice dictation", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "piloter")!.items, "voice").run();
    expect(ctx.command).toHaveBeenCalledWith("toggleVoice");
  });

  it("run() on 'mute' stops the voice", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "piloter")!.items, "mute").run();
    expect(ctx.command).toHaveBeenCalledWith("stopVoice");
  });

  it("run() on 'stop' cancels the current thinking turn", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "piloter")!.items, "stop").run();
    expect(ctx.command).toHaveBeenCalledWith("cancel");
  });
});

describe("commander buildMenu — nested open-app submenu", () => {
  it.each([
    ["open-telecom", "telecom"],
    ["open-forecast", "forecast"],
    ["open-geo", "geo"],
    ["open-data-browser", "data-browser"],
    ["open-moudir", "moudir"],
  ])("run() on '%s' opens the '%s' app", (itemId, appId) => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "piloter")!.items, itemId).run();
    expect(ctx.openApp).toHaveBeenCalledWith(appId);
  });
});

describe("commander buildMenu — piloter desktop-wide actions", () => {
  it("run() on 'ask-moudir' hands off analysis to Moudir with a specific prompt", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "piloter")!.items, "ask-moudir").run();
    expect(ctx.askMoudir).toHaveBeenCalledWith(expect.stringContaining("transactions"));
  });

  it("run() on 'arrange' cascades all windows", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "piloter")!.items, "arrange").run();
    expect(ctx.cascadeArrange).toHaveBeenCalledTimes(1);
  });

  it("run() on 'close-all' closes all windows and is danger-styled", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    const item = getAction(findGroup(groups, "piloter")!.items, "close-all");
    item.run();
    expect(ctx.closeAll).toHaveBeenCalledTimes(1);
    expect(item.danger).toBe(true);
  });
});
