import { describe, expect, it } from "vitest";

import { buildMenu } from "@/features/desktop/core/menu/apps/monitor";
import { findGroup, findItem, makeMenuContext, runAction } from "./_helpers";

/**
 * Behavioral test suite for the "monitor" (Surveillance Canaux) app's menu builder.
 */

describe("monitor buildMenu — structure", () => {
  it("returns the file, alerts and help groups in order", () => {
    const groups = buildMenu(makeMenuContext());
    expect(groups.map((g) => g.id)).toEqual(["file", "alerts", "help"]);
  });

  it("labels the groups in French", () => {
    const groups = buildMenu(makeMenuContext());
    expect(findGroup(groups, "file")?.label).toBe("Fichier");
    expect(findGroup(groups, "alerts")?.label).toBe("Alertes");
    expect(findGroup(groups, "help")?.label).toBe("Aide");
  });
});

describe("monitor buildMenu — file group actions", () => {
  it("new-window opens monitor in a forced-new window", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "file")!.items, "new-window");
    expect(ctx.openApp).toHaveBeenCalledWith("monitor", { forceNew: true });
  });

  it("open-report opens the telecom app", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "file")!.items, "open-report");
    expect(ctx.openApp).toHaveBeenCalledWith("telecom");
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

describe("monitor buildMenu — alerts group actions", () => {
  it("mark-read runs ctx.command('mark-read')", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "alerts")!.items, "mark-read");
    expect(ctx.command).toHaveBeenCalledWith("mark-read");
  });

  it("clear-notifications runs ctx.command('clear-notifications')", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "alerts")!.items, "clear-notifications");
    expect(ctx.command).toHaveBeenCalledWith("clear-notifications");
  });

  it("toggle-sound runs ctx.command('toggle-sound')", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "alerts")!.items, "toggle-sound");
    expect(ctx.command).toHaveBeenCalledWith("toggle-sound");
  });

  it("clear-events is a danger action that runs ctx.command('clear-events')", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    const alerts = findGroup(groups, "alerts")!;
    const clearEvents = findItem(alerts.items, "clear-events");
    expect((clearEvents as { danger?: boolean }).danger).toBe(true);
    runAction(alerts.items, "clear-events");
    expect(ctx.command).toHaveBeenCalledWith("clear-events");
  });
});

describe("monitor buildMenu — help group actions", () => {
  it("explain-monitor asks Moudir to explain channel monitoring", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "help")!.items, "explain-monitor");
    expect(ctx.askMoudir).toHaveBeenCalledWith(
      "Explique le fonctionnement de la surveillance des canaux : santé des canaux, règles d'alerte, conformité SLA et notifications.",
    );
  });
});
