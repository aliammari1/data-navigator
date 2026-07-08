import { describe, expect, it, vi } from "vitest";

import { buildMenu } from "@/features/desktop/core/menu/apps/help";
import { findGroup, findItem, makeMenuContext, runAction } from "./_helpers";

/**
 * Behavioral test suite for the "help" (Aide) app's menu builder.
 */

describe("help buildMenu — structure", () => {
  it("returns the file, consultation and help groups in order", () => {
    const groups = buildMenu(makeMenuContext());
    expect(groups.map((g) => g.id)).toEqual(["file", "consultation", "help"]);
  });

  it("labels the groups in French", () => {
    const groups = buildMenu(makeMenuContext());
    expect(findGroup(groups, "file")?.label).toBe("Fichier");
    expect(findGroup(groups, "consultation")?.label).toBe("Consultation");
    expect(findGroup(groups, "help")?.label).toBe("Aide");
  });
});

describe("help buildMenu — file group actions", () => {
  it("new-window opens help in a forced-new window", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "file")!.items, "new-window");
    expect(ctx.openApp).toHaveBeenCalledWith("help", { forceNew: true });
  });

  it("print calls window.print() when window is defined", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    runAction(findGroup(groups, "file")!.items, "print");
    expect(printSpy).toHaveBeenCalledTimes(1);
    printSpy.mockRestore();
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

describe("help buildMenu — consultation group actions", () => {
  it("go-features switches to the features page", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "consultation")!.items, "go-features");
    expect(ctx.setActivePage).toHaveBeenCalledWith("features");
  });

  it("go-faq switches to the faq page", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "consultation")!.items, "go-faq");
    expect(ctx.setActivePage).toHaveBeenCalledWith("faq");
  });

  it("go-shortcuts switches to the shortcuts page", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "consultation")!.items, "go-shortcuts");
    expect(ctx.setActivePage).toHaveBeenCalledWith("shortcuts");
  });

  it("clear-search runs ctx.command('clear-search')", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "consultation")!.items, "clear-search");
    expect(ctx.command).toHaveBeenCalledWith("clear-search");
  });
});

describe("help buildMenu — help group actions", () => {
  it("ask-moudir asks Moudir for help using the app", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "help")!.items, "ask-moudir");
    expect(ctx.askMoudir).toHaveBeenCalledWith("J'ai besoin d'aide pour utiliser Data Navigator.");
  });

  it("open-settings opens the settings app", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "help")!.items, "open-settings");
    expect(ctx.openApp).toHaveBeenCalledWith("settings");
  });
});
