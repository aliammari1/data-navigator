import { describe, expect, it } from "vitest";

import { buildMenu } from "@/features/desktop/core/menu/apps/home";
import { findGroup, findItem, makeMenuContext, runAction } from "./_helpers";

/**
 * Behavioral test suite for the "home" (Accueil) app's menu builder.
 */

describe("home buildMenu — structure", () => {
  it("returns the file, dashboard and help groups in order", () => {
    const groups = buildMenu(makeMenuContext());
    expect(groups.map((g) => g.id)).toEqual(["file", "dashboard", "help"]);
  });

  it("labels the groups in French", () => {
    const groups = buildMenu(makeMenuContext());
    expect(findGroup(groups, "file")?.label).toBe("Fichier");
    expect(findGroup(groups, "dashboard")?.label).toBe("Tableau de bord");
    expect(findGroup(groups, "help")?.label).toBe("Aide");
  });
});

describe("home buildMenu — file group actions", () => {
  it("new-window opens home in a forced-new window", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "file")!.items, "new-window");
    expect(ctx.openApp).toHaveBeenCalledWith("home", { forceNew: true });
  });

  it("import opens the upload app", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "file")!.items, "import");
    expect(ctx.openApp).toHaveBeenCalledWith("upload");
  });

  it("open-report opens the telecom app", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "file")!.items, "open-report");
    expect(ctx.openApp).toHaveBeenCalledWith("telecom");
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

describe("home buildMenu — dashboard group quick-workspace actions", () => {
  it.each([
    ["ws-moudir", "moudir"],
    ["ws-telecom", "telecom"],
    ["ws-forecast", "forecast"],
    ["ws-analysis", "ai-analysis"],
  ])("%s opens the '%s' app", (id, appId) => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "dashboard")!.items, id);
    expect(ctx.openApp).toHaveBeenCalledWith(appId);
  });

  it("ask-moudir asks Moudir to summarize today's report", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "dashboard")!.items, "ask-moudir");
    expect(ctx.askMoudir).toHaveBeenCalledWith(
      "Résume le rapport du jour : transactions, taux de réussite, montant et anomalies.",
    );
  });
});

describe("home buildMenu — help group actions", () => {
  it("guided-tour opens the help app", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "help")!.items, "guided-tour");
    expect(ctx.openApp).toHaveBeenCalledWith("help");
  });
});
