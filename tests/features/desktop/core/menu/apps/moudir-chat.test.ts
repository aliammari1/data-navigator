import { describe, expect, it } from "vitest";

import { buildMenu } from "@/features/desktop/core/menu/apps/moudir-chat";
import { findGroup, findItem, makeMenuContext, runAction } from "./_helpers";

/**
 * Behavioral test suite for the "moudir-chat" (Moudir — Assistant IA) app's menu builder.
 */

describe("moudir-chat buildMenu — structure", () => {
  it("returns the file, analyze and help groups in order", () => {
    const groups = buildMenu(makeMenuContext());
    expect(groups.map((g) => g.id)).toEqual(["file", "analyze", "help"]);
  });

  it("labels the groups in French", () => {
    const groups = buildMenu(makeMenuContext());
    expect(findGroup(groups, "file")?.label).toBe("Fichier");
    expect(findGroup(groups, "analyze")?.label).toBe("Analyse");
    expect(findGroup(groups, "help")?.label).toBe("Aide");
  });

  it("nests the three canned questions under the 'quick-questions' submenu", () => {
    const groups = buildMenu(makeMenuContext());
    const analyze = findGroup(groups, "analyze")!;
    const quick = findItem(analyze.items, "quick-questions");
    expect(quick?.kind).toBe("submenu");
    const nested = (quick as { items: { id: string }[] }).items;
    expect(nested.map((i) => i.id)).toEqual(["q-success-rate", "q-risks", "q-channels-time"]);
  });
});

describe("moudir-chat buildMenu — file group actions", () => {
  it("new-conversation runs ctx.command('reset')", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "file")!.items, "new-conversation");
    expect(ctx.command).toHaveBeenCalledWith("reset");
  });

  it("import-data opens the upload app", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "file")!.items, "import-data");
    expect(ctx.openApp).toHaveBeenCalledWith("upload");
  });

  it("export-deck runs ctx.command('export-deck')", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "file")!.items, "export-deck");
    expect(ctx.command).toHaveBeenCalledWith("export-deck");
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

describe("moudir-chat buildMenu — analyze group actions", () => {
  it("stop-analysis runs ctx.command('cancel')", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "analyze")!.items, "stop-analysis");
    expect(ctx.command).toHaveBeenCalledWith("cancel");
  });

  it.each([
    ["q-success-rate", "Pourquoi le taux de réussite a-t-il changé ?"],
    ["q-risks", "Quels sont les plus gros risques dans ces données ?"],
    ["q-channels-time", "Montre les transactions par canal au fil du temps"],
  ])("%s asks Moudir the canned question", (id, prompt) => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "analyze")!.items, id);
    expect(ctx.askMoudir).toHaveBeenCalledWith(prompt);
  });

  it("exec-summary asks Moudir for a one-paragraph executive summary", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "analyze")!.items, "exec-summary");
    expect(ctx.askMoudir).toHaveBeenCalledWith("Donne-moi une synthèse exécutive en un paragraphe");
  });
});

describe("moudir-chat buildMenu — help group actions", () => {
  it("moudir-help opens the help app", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "help")!.items, "moudir-help");
    expect(ctx.openApp).toHaveBeenCalledWith("help");
  });
});
