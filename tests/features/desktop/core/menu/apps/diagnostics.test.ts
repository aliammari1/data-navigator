import { describe, expect, it } from "vitest";

import { buildMenu } from "@/features/desktop/core/menu/apps/diagnostics";
import { findGroup, getAction, makeMenuContext } from "./test-helpers";

/**
 * Behavioral tests for the "diagnostics" app menu builder ("Système").
 */

describe("diagnostics buildMenu — shape", () => {
  it("declares the file, diagnostics, and help groups in order", () => {
    const groups = buildMenu(makeMenuContext());
    expect(groups.map((g) => g.id)).toEqual(["file", "diagnostics", "help"]);
  });

  it("labels the groups in French", () => {
    const groups = buildMenu(makeMenuContext());
    expect(findGroup(groups, "file")?.label).toBe("Fichier");
    expect(findGroup(groups, "diagnostics")?.label).toBe("Système");
    expect(findGroup(groups, "help")?.label).toBe("Aide");
  });
});

describe("diagnostics buildMenu — file group", () => {
  it("run() on 'new-window' opens a forced new diagnostics window", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "file")!.items, "new-window").run();
    expect(ctx.openApp).toHaveBeenCalledWith("diagnostics", { forceNew: true });
  });

  it("run() on 'refresh' sends the refresh command", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "file")!.items, "refresh").run();
    expect(ctx.command).toHaveBeenCalledWith("refresh");
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

describe("diagnostics buildMenu — système group", () => {
  it("run() on 'open-settings' opens the settings app", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "diagnostics")!.items, "open-settings").run();
    expect(ctx.openApp).toHaveBeenCalledWith("settings");
  });

  it("run() on 'open-upload' opens the upload app", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "diagnostics")!.items, "open-upload").run();
    expect(ctx.openApp).toHaveBeenCalledWith("upload");
  });

  it("run() on 'ask-moudir' asks Moudir with a runtime-diagnostics-specific prompt", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "diagnostics")!.items, "ask-moudir").run();
    expect(ctx.askMoudir).toHaveBeenCalledWith(expect.stringContaining("DuckDB"));
  });
});

describe("diagnostics buildMenu — help group", () => {
  it("run() on 'open-help' opens the help center app", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "help")!.items, "open-help").run();
    expect(ctx.openApp).toHaveBeenCalledWith("help");
  });
});
