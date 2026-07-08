import { describe, expect, it } from "vitest";

import { buildMenu } from "@/features/desktop/core/menu/apps/ux-innovations";

import { findGroup, getAction, makeMenuContext } from "./menu-context";

/**
 * Behavioral test suite for the "ux-innovations" app menu (Succès).
 *
 * `buildMenu` is a pure function of {@link MenuContext} → declarative menu
 * data. Each test asserts both the declared shape and the real ctx action
 * wired to `run()` — including the two independent items ("tour" in the
 * Succès menu and "help-tour" in the Aide menu) that both dispatch the same
 * "tour" command.
 */

// ─── Menu shape ───────────────────────────────────────────────────────────────

describe("ux-innovations buildMenu — shape", () => {
  it("declares exactly the Fichier, Succès and Aide groups, in order", () => {
    const groups = buildMenu(makeMenuContext());
    expect(groups.map((g) => g.id)).toEqual(["file", "succes", "help"]);
  });

  it("labels the groups in French", () => {
    const groups = buildMenu(makeMenuContext());
    expect(findGroup(groups, "file")?.label).toBe("Fichier");
    expect(findGroup(groups, "succes")?.label).toBe("Succès");
    expect(findGroup(groups, "help")?.label).toBe("Aide");
  });

  it("declares the expected Fichier item ids in order", () => {
    const groups = buildMenu(makeMenuContext());
    const file = findGroup(groups, "file");
    expect(file?.items.map((i) => i.id)).toEqual([
      "new-window",
      "import-data",
      "sep-file",
      "close",
    ]);
  });

  it("declares the expected Succès item ids in order", () => {
    const groups = buildMenu(makeMenuContext());
    const succes = findGroup(groups, "succes");
    expect(succes?.items.map((i) => i.id)).toEqual(["tour", "tips", "sep-succes", "reset"]);
  });

  it("declares the Aide item", () => {
    const groups = buildMenu(makeMenuContext());
    const help = findGroup(groups, "help");
    expect(help?.items.map((i) => i.id)).toEqual(["help-tour"]);
  });

  it("marks 'close' and 'reset' as danger actions", () => {
    const groups = buildMenu(makeMenuContext());
    const file = findGroup(groups, "file");
    const succes = findGroup(groups, "succes");
    expect(getAction(file?.items ?? [], "close").danger).toBe(true);
    expect(getAction(succes?.items ?? [], "reset").danger).toBe(true);
  });
});

// ─── Fichier actions ──────────────────────────────────────────────────────────

describe("ux-innovations buildMenu — Fichier actions", () => {
  it("'new-window' opens a forced-new ux-innovations window", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "new-window").run();
    expect(ctx.openApp).toHaveBeenCalledWith("ux-innovations", { forceNew: true });
  });

  it("'import-data' opens the upload app", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "import-data").run();
    expect(ctx.openApp).toHaveBeenCalledWith("upload");
  });

  it("'close' closes the focused window", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "close").run();
    expect(ctx.closeWindow).toHaveBeenCalledTimes(1);
  });
});

// ─── Succès actions ───────────────────────────────────────────────────────────

describe("ux-innovations buildMenu — Succès actions", () => {
  it("'tour' dispatches the 'tour' command", () => {
    const ctx = makeMenuContext();
    const succes = findGroup(buildMenu(ctx), "succes");
    getAction(succes?.items ?? [], "tour").run();
    expect(ctx.command).toHaveBeenCalledWith("tour");
  });

  it("'tips' asks Moudir how to earn more XP", () => {
    const ctx = makeMenuContext();
    const succes = findGroup(buildMenu(ctx), "succes");
    getAction(succes?.items ?? [], "tips").run();
    expect(ctx.askMoudir).toHaveBeenCalledWith(
      "Comment gagner plus de XP et débloquer davantage de succès dans Data Navigator ?",
    );
  });

  it("'reset' dispatches the 'reset' command", () => {
    const ctx = makeMenuContext();
    const succes = findGroup(buildMenu(ctx), "succes");
    getAction(succes?.items ?? [], "reset").run();
    expect(ctx.command).toHaveBeenCalledWith("reset");
  });
});

// ─── Aide actions ─────────────────────────────────────────────────────────────

describe("ux-innovations buildMenu — Aide actions", () => {
  it("'help-tour' dispatches the same 'tour' command as the Succès menu's 'tour'", () => {
    const ctx = makeMenuContext();
    const help = findGroup(buildMenu(ctx), "help");
    getAction(help?.items ?? [], "help-tour").run();
    expect(ctx.command).toHaveBeenCalledWith("tour");
  });
});
