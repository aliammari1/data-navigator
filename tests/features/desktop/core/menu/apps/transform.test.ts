import { describe, expect, it } from "vitest";

import { buildMenu } from "@/features/desktop/core/menu/apps/transform";

import { findGroup, getAction, makeMenuContext } from "./menu-context";

/**
 * Behavioral test suite for the "transform" app menu (Transformations).
 *
 * `buildMenu` is a pure function of {@link MenuContext} → declarative menu
 * data. Each test asserts both the declared shape and the real ctx action
 * wired to `run()`.
 */

// ─── Menu shape ───────────────────────────────────────────────────────────────

describe("transform buildMenu — shape", () => {
  it("declares exactly the Fichier, Pipeline and Aide groups, in order", () => {
    const groups = buildMenu(makeMenuContext());
    expect(groups.map((g) => g.id)).toEqual(["file", "pipeline", "help"]);
  });

  it("labels the groups in French", () => {
    const groups = buildMenu(makeMenuContext());
    expect(findGroup(groups, "file")?.label).toBe("Fichier");
    expect(findGroup(groups, "pipeline")?.label).toBe("Pipeline");
    expect(findGroup(groups, "help")?.label).toBe("Aide");
  });

  it("declares the expected Fichier item ids in order", () => {
    const groups = buildMenu(makeMenuContext());
    const file = findGroup(groups, "file");
    expect(file?.items.map((i) => i.id)).toEqual([
      "new-window",
      "sep-import",
      "import-data",
      "sep-recipe",
      "save-recipe",
      "recipes",
      "sep-export",
      "export-csv",
      "export-xlsx",
      "sep-close",
      "close",
    ]);
  });

  it("declares the expected Pipeline item ids in order", () => {
    const groups = buildMenu(makeMenuContext());
    const pipeline = findGroup(groups, "pipeline");
    expect(pipeline?.items.map((i) => i.id)).toEqual([
      "run",
      "reset",
      "sep-steps",
      "add-step",
      "profile-source",
      "copy-sql",
      "sep-related",
      "open-lineage",
      "ask-moudir",
    ]);
  });

  it("declares the Aide item", () => {
    const groups = buildMenu(makeMenuContext());
    const help = findGroup(groups, "help");
    expect(help?.items.map((i) => i.id)).toEqual(["explain-transform"]);
  });

  it("marks 'close' as a danger action", () => {
    const groups = buildMenu(makeMenuContext());
    const file = findGroup(groups, "file");
    expect(getAction(file?.items ?? [], "close").danger).toBe(true);
  });
});

// ─── Fichier actions ──────────────────────────────────────────────────────────

describe("transform buildMenu — Fichier actions", () => {
  it("'new-window' opens a forced-new transform window", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "new-window").run();
    expect(ctx.openApp).toHaveBeenCalledWith("transform", { forceNew: true });
  });

  it("'import-data' opens the upload app", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "import-data").run();
    expect(ctx.openApp).toHaveBeenCalledWith("upload");
  });

  it("'save-recipe' dispatches the 'save-recipe' command", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "save-recipe").run();
    expect(ctx.command).toHaveBeenCalledWith("save-recipe");
  });

  it("'recipes' dispatches the 'recipes' command", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "recipes").run();
    expect(ctx.command).toHaveBeenCalledWith("recipes");
  });

  it("'export-csv' dispatches the 'export-csv' command", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "export-csv").run();
    expect(ctx.command).toHaveBeenCalledWith("export-csv");
  });

  it("'export-xlsx' dispatches the 'export-xlsx' command", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "export-xlsx").run();
    expect(ctx.command).toHaveBeenCalledWith("export-xlsx");
  });

  it("'close' closes the focused window", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "close").run();
    expect(ctx.closeWindow).toHaveBeenCalledTimes(1);
  });
});

// ─── Pipeline actions ─────────────────────────────────────────────────────────

describe("transform buildMenu — Pipeline actions", () => {
  it("'run' dispatches the 'run' command", () => {
    const ctx = makeMenuContext();
    const pipeline = findGroup(buildMenu(ctx), "pipeline");
    getAction(pipeline?.items ?? [], "run").run();
    expect(ctx.command).toHaveBeenCalledWith("run");
  });

  it("'reset' dispatches the 'reset' command", () => {
    const ctx = makeMenuContext();
    const pipeline = findGroup(buildMenu(ctx), "pipeline");
    getAction(pipeline?.items ?? [], "reset").run();
    expect(ctx.command).toHaveBeenCalledWith("reset");
  });

  it("'add-step' dispatches the 'add-step' command", () => {
    const ctx = makeMenuContext();
    const pipeline = findGroup(buildMenu(ctx), "pipeline");
    getAction(pipeline?.items ?? [], "add-step").run();
    expect(ctx.command).toHaveBeenCalledWith("add-step");
  });

  it("'profile-source' dispatches the 'profile' command", () => {
    const ctx = makeMenuContext();
    const pipeline = findGroup(buildMenu(ctx), "pipeline");
    getAction(pipeline?.items ?? [], "profile-source").run();
    expect(ctx.command).toHaveBeenCalledWith("profile");
  });

  it("'copy-sql' dispatches the 'copy-sql' command", () => {
    const ctx = makeMenuContext();
    const pipeline = findGroup(buildMenu(ctx), "pipeline");
    getAction(pipeline?.items ?? [], "copy-sql").run();
    expect(ctx.command).toHaveBeenCalledWith("copy-sql");
  });

  it("'open-lineage' opens the lineage app", () => {
    const ctx = makeMenuContext();
    const pipeline = findGroup(buildMenu(ctx), "pipeline");
    getAction(pipeline?.items ?? [], "open-lineage").run();
    expect(ctx.openApp).toHaveBeenCalledWith("lineage");
  });

  it("'ask-moudir' asks Moudir to propose a transformation pipeline", () => {
    const ctx = makeMenuContext();
    const pipeline = findGroup(buildMenu(ctx), "pipeline");
    getAction(pipeline?.items ?? [], "ask-moudir").run();
    expect(ctx.askMoudir).toHaveBeenCalledWith(
      "Propose un pipeline de transformation SQL (filtres, agrégations, dérivations) adapté au jeu de données courant et explique chaque étape.",
    );
  });
});

// ─── Aide actions ─────────────────────────────────────────────────────────────

describe("transform buildMenu — Aide actions", () => {
  it("'explain-transform' asks Moudir to explain how transform pipelines work", () => {
    const ctx = makeMenuContext();
    const help = findGroup(buildMenu(ctx), "help");
    getAction(help?.items ?? [], "explain-transform").run();
    expect(ctx.askMoudir).toHaveBeenCalledWith(
      "Explique en termes simples comment construire un pipeline de transformation de données : étapes (filtre, sélection, dérivation, agrégation, jointure, pivot), aperçu, profil des colonnes et export du résultat.",
    );
  });
});
