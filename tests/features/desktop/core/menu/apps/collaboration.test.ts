import { describe, expect, it } from "vitest";

import { buildMenu } from "@/features/desktop/core/menu/apps/collaboration";
import { findGroup, getAction, makeMenuContext } from "./test-helpers";

/**
 * Behavioral tests for the "collaboration" app menu builder.
 *
 * The "Atelier" (workshop) menu sends a `navigate` command with a `pageId`
 * payload per section — verifying each item's exact payload is the core
 * behavior under test here.
 */

describe("collaboration buildMenu — shape", () => {
  it("declares the file, workshop, and help groups in order", () => {
    const groups = buildMenu(makeMenuContext());
    expect(groups.map((g) => g.id)).toEqual(["file", "workshop", "help"]);
  });

  it("labels the groups in French", () => {
    const groups = buildMenu(makeMenuContext());
    expect(findGroup(groups, "file")?.label).toBe("Fichier");
    expect(findGroup(groups, "workshop")?.label).toBe("Atelier");
    expect(findGroup(groups, "help")?.label).toBe("Aide");
  });
});

describe("collaboration buildMenu — file group", () => {
  it("run() on 'new-window' opens a forced new collaboration window", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "file")!.items, "new-window").run();
    expect(ctx.openApp).toHaveBeenCalledWith("collaboration", { forceNew: true });
  });

  it("run() on 'invite' sends the invite command", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "file")!.items, "invite").run();
    expect(ctx.command).toHaveBeenCalledWith("invite");
  });

  it("run() on 'close' closes the window", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "file")!.items, "close").run();
    expect(ctx.closeWindow).toHaveBeenCalledTimes(1);
  });
});

describe("collaboration buildMenu — workshop navigation", () => {
  it.each([
    ["go-overview", "overview"],
    ["go-comments", "comments"],
    ["go-changes", "changes"],
    ["go-live", "live"],
    ["go-annotations", "annotations"],
    ["go-approval", "approval"],
    ["go-audit", "audit"],
  ])("run() on '%s' sends navigate with pageId '%s'", (itemId, pageId) => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "workshop")!.items, itemId).run();
    expect(ctx.command).toHaveBeenCalledWith("navigate", { pageId });
  });
});

describe("collaboration buildMenu — help group", () => {
  it("run() on 'help-team' navigates back to the overview section", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "help")!.items, "help-team").run();
    expect(ctx.command).toHaveBeenCalledWith("navigate", { pageId: "overview" });
  });

  it("run() on 'ask-moudir' asks Moudir with a collaboration-review-specific prompt", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "help")!.items, "ask-moudir").run();
    expect(ctx.askMoudir).toHaveBeenCalledWith(expect.stringContaining("collaboration"));
  });
});
