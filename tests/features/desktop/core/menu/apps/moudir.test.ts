import { describe, expect, it } from "vitest";

import { buildMenu } from "@/features/desktop/core/menu/apps/moudir";
import { findGroup, findItem, makeMenuContext, runAction } from "./_helpers";

/**
 * Behavioral test suite for the "moudir" (Formulateur — Studio IA) app's menu builder.
 */

describe("moudir buildMenu — structure", () => {
  it("returns the file, formulate and help groups in order", () => {
    const groups = buildMenu(makeMenuContext());
    expect(groups.map((g) => g.id)).toEqual(["file", "formulate", "help"]);
  });

  it("labels the groups in French", () => {
    const groups = buildMenu(makeMenuContext());
    expect(findGroup(groups, "file")?.label).toBe("Fichier");
    expect(findGroup(groups, "formulate")?.label).toBe("Formulation");
    expect(findGroup(groups, "help")?.label).toBe("Aide");
  });

  it("nests the three quick instructions under the 'quick-instructions' submenu", () => {
    const groups = buildMenu(makeMenuContext());
    const formulate = findGroup(groups, "formulate")!;
    const quick = findItem(formulate.items, "quick-instructions");
    expect(quick?.kind).toBe("submenu");
    const nested = (quick as { items: { id: string }[] }).items;
    expect(nested.map((i) => i.id)).toEqual(["i-channels-time", "i-success-daily", "i-top-errors"]);
  });
});

describe("moudir buildMenu — file group actions", () => {
  it("new-formulation runs ctx.command('reset')", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "file")!.items, "new-formulation");
    expect(ctx.command).toHaveBeenCalledWith("reset");
  });

  it("import-data opens the upload app", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "file")!.items, "import-data");
    expect(ctx.openApp).toHaveBeenCalledWith("upload");
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

describe("moudir buildMenu — formulate group actions", () => {
  it("cancel-derivation runs ctx.command('cancel')", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "formulate")!.items, "cancel-derivation");
    expect(ctx.command).toHaveBeenCalledWith("cancel");
  });

  it.each([
    ["i-channels-time", "Montre les transactions par canal au fil du temps"],
    ["i-success-daily", "Calcule le taux de réussite par jour"],
    ["i-top-errors", "Montre le top 10 des codes d'erreur par volume"],
  ])("%s runs ctx.command('ask', { prompt: ... }) with the canned instruction", (id, prompt) => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "formulate")!.items, id);
    expect(ctx.command).toHaveBeenCalledWith("ask", { prompt });
  });
});

describe("moudir buildMenu — help group actions", () => {
  it("moudir-help opens the help app", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "help")!.items, "moudir-help");
    expect(ctx.openApp).toHaveBeenCalledWith("help");
  });
});
