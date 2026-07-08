import { describe, expect, it } from "vitest";

import { buildMenu } from "@/features/desktop/core/menu/apps/reconciliation";

import { findGroup, getAction, makeMenuContext } from "./menu-context";

/**
 * Behavioral test suite for the "reconciliation" app menu (Rapprochement).
 *
 * `buildMenu` is a pure function of {@link MenuContext} → declarative menu
 * data. Each test asserts both the declared shape and the real ctx action
 * wired to `run()`.
 */

// ─── Menu shape ───────────────────────────────────────────────────────────────

describe("reconciliation buildMenu — shape", () => {
  it("declares exactly the Fichier and Rapprochement groups, in order", () => {
    const groups = buildMenu(makeMenuContext());
    expect(groups.map((g) => g.id)).toEqual(["file", "reconciliation"]);
  });

  it("labels the groups in French", () => {
    const groups = buildMenu(makeMenuContext());
    expect(findGroup(groups, "file")?.label).toBe("Fichier");
    expect(findGroup(groups, "reconciliation")?.label).toBe("Rapprochement");
  });

  it("declares the expected Fichier item ids in order", () => {
    const groups = buildMenu(makeMenuContext());
    const file = findGroup(groups, "file");
    expect(file?.items.map((i) => i.id)).toEqual([
      "new-window",
      "sep-sources",
      "import",
      "browse",
      "sep-close",
      "close",
    ]);
  });

  it("declares the expected Rapprochement item ids in order", () => {
    const groups = buildMenu(makeMenuContext());
    const reconciliation = findGroup(groups, "reconciliation");
    expect(reconciliation?.items.map((i) => i.id)).toEqual([
      "history",
      "lineage",
      "sep-ai",
      "ask-moudir",
    ]);
  });
});

// ─── Fichier actions ──────────────────────────────────────────────────────────

describe("reconciliation buildMenu — Fichier actions", () => {
  it("'new-window' opens a forced-new reconciliation window", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "new-window").run();
    expect(ctx.openApp).toHaveBeenCalledWith("reconciliation", { forceNew: true });
  });

  it("'import' opens the upload app", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "import").run();
    expect(ctx.openApp).toHaveBeenCalledWith("upload");
  });

  it("'browse' opens the data-browser app", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "browse").run();
    expect(ctx.openApp).toHaveBeenCalledWith("data-browser");
  });

  it("'close' closes the focused window", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "close").run();
    expect(ctx.closeWindow).toHaveBeenCalledTimes(1);
  });
});

// ─── Rapprochement actions ────────────────────────────────────────────────────

describe("reconciliation buildMenu — Rapprochement actions", () => {
  it("'history' opens the history app", () => {
    const ctx = makeMenuContext();
    const group = findGroup(buildMenu(ctx), "reconciliation");
    getAction(group?.items ?? [], "history").run();
    expect(ctx.openApp).toHaveBeenCalledWith("history");
  });

  it("'lineage' opens the lineage app", () => {
    const ctx = makeMenuContext();
    const group = findGroup(buildMenu(ctx), "reconciliation");
    getAction(group?.items ?? [], "lineage").run();
    expect(ctx.openApp).toHaveBeenCalledWith("lineage");
  });

  it("'ask-moudir' asks a reconciliation-gap analysis prompt", () => {
    const ctx = makeMenuContext();
    const group = findGroup(buildMenu(ctx), "reconciliation");
    getAction(group?.items ?? [], "ask-moudir").run();
    expect(ctx.askMoudir).toHaveBeenCalledWith(
      "Aide-moi à interpréter les écarts matériels d'un rapprochement entre deux jeux de données et propose des hypothèses sur leurs causes.",
    );
  });
});
