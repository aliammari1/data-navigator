import { describe, expect, it } from "vitest";

import { buildMenu } from "@/features/desktop/core/menu/apps/eye-tracking";
import { findGroup, getAction, makeMenuContext } from "./test-helpers";

/**
 * Behavioral tests for the "eye-tracking" app menu builder ("Suivi du regard").
 */

describe("eye-tracking buildMenu — shape", () => {
  it("declares the file and tracking groups in order", () => {
    const groups = buildMenu(makeMenuContext());
    expect(groups.map((g) => g.id)).toEqual(["file", "tracking"]);
  });

  it("labels the groups in French", () => {
    const groups = buildMenu(makeMenuContext());
    expect(findGroup(groups, "file")?.label).toBe("Fichier");
    expect(findGroup(groups, "tracking")?.label).toBe("Suivi");
  });
});

describe("eye-tracking buildMenu — file group", () => {
  it("run() on 'new-window' opens a forced new eye-tracking window", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "file")!.items, "new-window").run();
    expect(ctx.openApp).toHaveBeenCalledWith("eye-tracking", { forceNew: true });
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

describe("eye-tracking buildMenu — tracking group", () => {
  it("run() on 'toggle-tracking' sends the toggle-tracking command", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "tracking")!.items, "toggle-tracking").run();
    expect(ctx.command).toHaveBeenCalledWith("toggle-tracking");
  });

  it("run() on 'calibrate' sends the calibrate command", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "tracking")!.items, "calibrate").run();
    expect(ctx.command).toHaveBeenCalledWith("calibrate");
  });

  it("run() on 'toggle-gaze-dot' sends the toggle-gaze-dot command", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "tracking")!.items, "toggle-gaze-dot").run();
    expect(ctx.command).toHaveBeenCalledWith("toggle-gaze-dot");
  });

  it("run() on 'toggle-heatmap' sends the toggle-heatmap command", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "tracking")!.items, "toggle-heatmap").run();
    expect(ctx.command).toHaveBeenCalledWith("toggle-heatmap");
  });
});
