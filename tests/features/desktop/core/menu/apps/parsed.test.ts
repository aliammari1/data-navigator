import { describe, expect, it } from "vitest";

import { buildMenu } from "@/features/desktop/core/menu/apps/parsed";

import { findGroup, getAction, makeMenuContext } from "./menu-context";

/**
 * Behavioral test suite for the "parsed" app menu (Profil des données).
 *
 * `buildMenu` is a pure function of {@link MenuContext} → declarative menu
 * data. Each test asserts both the declared shape (group/item ids + labels)
 * and the real ctx action wired to `run()`.
 */

// ─── Menu shape ───────────────────────────────────────────────────────────────

describe("parsed buildMenu — shape", () => {
  it("declares exactly the Fichier and Profil groups, in order", () => {
    const groups = buildMenu(makeMenuContext());
    expect(groups.map((g) => g.id)).toEqual(["file", "profil"]);
  });

  it("labels the groups in French", () => {
    const groups = buildMenu(makeMenuContext());
    expect(findGroup(groups, "file")?.label).toBe("Fichier");
    expect(findGroup(groups, "profil")?.label).toBe("Profil");
  });

  it("declares the expected Fichier item ids in order", () => {
    const groups = buildMenu(makeMenuContext());
    const file = findGroup(groups, "file");
    expect(file?.items.map((i) => i.id)).toEqual([
      "new-window",
      "import",
      "sep-file-1",
      "export-csv",
      "open-browser",
      "sep-file-2",
      "close",
    ]);
  });

  it("declares the expected Profil item ids in order", () => {
    const groups = buildMenu(makeMenuContext());
    const profil = findGroup(groups, "profil");
    expect(profil?.items.map((i) => i.id)).toEqual([
      "refresh",
      "export",
      "clear-filters",
      "sep-profil-1",
      "ai-analysis",
      "deep-analytics",
      "transform",
      "report",
      "sep-profil-2",
      "ask-moudir",
    ]);
  });

  it("marks 'close' as a danger action", () => {
    const groups = buildMenu(makeMenuContext());
    const file = findGroup(groups, "file");
    expect(getAction(file?.items ?? [], "close").danger).toBe(true);
  });
});

// ─── Fichier actions ──────────────────────────────────────────────────────────

describe("parsed buildMenu — Fichier actions", () => {
  it("'new-window' opens a forced-new parsed window", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "new-window").run();
    expect(ctx.openApp).toHaveBeenCalledWith("parsed", { forceNew: true });
  });

  it("'import' opens the upload app", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "import").run();
    expect(ctx.openApp).toHaveBeenCalledWith("upload");
  });

  it("'export-csv' dispatches the 'export' command", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "export-csv").run();
    expect(ctx.command).toHaveBeenCalledWith("export");
  });

  it("'open-browser' opens the data-browser app", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "open-browser").run();
    expect(ctx.openApp).toHaveBeenCalledWith("data-browser");
  });

  it("'close' closes the focused window", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "close").run();
    expect(ctx.closeWindow).toHaveBeenCalledTimes(1);
  });
});

// ─── Profil actions ───────────────────────────────────────────────────────────

describe("parsed buildMenu — Profil actions", () => {
  it("'refresh' dispatches the 'refresh' command", () => {
    const ctx = makeMenuContext();
    const profil = findGroup(buildMenu(ctx), "profil");
    getAction(profil?.items ?? [], "refresh").run();
    expect(ctx.command).toHaveBeenCalledWith("refresh");
  });

  it("'export' (Profil menu) dispatches the 'export' command", () => {
    const ctx = makeMenuContext();
    const profil = findGroup(buildMenu(ctx), "profil");
    getAction(profil?.items ?? [], "export").run();
    expect(ctx.command).toHaveBeenCalledWith("export");
  });

  it("'clear-filters' dispatches the 'clear-filters' command", () => {
    const ctx = makeMenuContext();
    const profil = findGroup(buildMenu(ctx), "profil");
    getAction(profil?.items ?? [], "clear-filters").run();
    expect(ctx.command).toHaveBeenCalledWith("clear-filters");
  });

  it("'ai-analysis' opens the ai-analysis app", () => {
    const ctx = makeMenuContext();
    const profil = findGroup(buildMenu(ctx), "profil");
    getAction(profil?.items ?? [], "ai-analysis").run();
    expect(ctx.openApp).toHaveBeenCalledWith("ai-analysis");
  });

  it("'deep-analytics' opens the deep-analytics app", () => {
    const ctx = makeMenuContext();
    const profil = findGroup(buildMenu(ctx), "profil");
    getAction(profil?.items ?? [], "deep-analytics").run();
    expect(ctx.openApp).toHaveBeenCalledWith("deep-analytics");
  });

  it("'transform' opens the transform app", () => {
    const ctx = makeMenuContext();
    const profil = findGroup(buildMenu(ctx), "profil");
    getAction(profil?.items ?? [], "transform").run();
    expect(ctx.openApp).toHaveBeenCalledWith("transform");
  });

  it("'report' opens the report-studio app", () => {
    const ctx = makeMenuContext();
    const profil = findGroup(buildMenu(ctx), "profil");
    getAction(profil?.items ?? [], "report").run();
    expect(ctx.openApp).toHaveBeenCalledWith("report-studio");
  });

  it("'ask-moudir' asks a data-quality prompt about the profile", () => {
    const ctx = makeMenuContext();
    const profil = findGroup(buildMenu(ctx), "profil");
    getAction(profil?.items ?? [], "ask-moudir").run();
    expect(ctx.askMoudir).toHaveBeenCalledWith(
      "Analyse le profil des données : qualité des colonnes, valeurs nulles et anomalies à corriger.",
    );
  });
});
