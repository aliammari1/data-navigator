import { describe, expect, it } from "vitest";

import { buildMenu } from "@/features/desktop/core/menu/apps/telecom";

import { findGroup, getAction, makeMenuContext } from "./menu-context";

/**
 * Behavioral test suite for the "telecom" app menu (Rapport Télécom).
 *
 * `buildMenu` is a pure function of {@link MenuContext} → declarative menu
 * data. Each test asserts both the declared shape and the real ctx action
 * wired to `run()`.
 */

// ─── Menu shape ───────────────────────────────────────────────────────────────

describe("telecom buildMenu — shape", () => {
  it("declares exactly the Fichier and Rapport groups, in order", () => {
    const groups = buildMenu(makeMenuContext());
    expect(groups.map((g) => g.id)).toEqual(["file", "report"]);
  });

  it("labels the groups in French", () => {
    const groups = buildMenu(makeMenuContext());
    expect(findGroup(groups, "file")?.label).toBe("Fichier");
    expect(findGroup(groups, "report")?.label).toBe("Rapport");
  });

  it("declares the expected Fichier item ids in order", () => {
    const groups = buildMenu(makeMenuContext());
    const file = findGroup(groups, "file");
    expect(file?.items.map((i) => i.id)).toEqual([
      "new-window",
      "import",
      "export-db",
      "file-sep",
      "close",
    ]);
  });

  it("declares the expected Rapport item ids in order", () => {
    const groups = buildMenu(makeMenuContext());
    const report = findGroup(groups, "report");
    expect(report?.items.map((i) => i.id)).toEqual([
      "refresh-history",
      "export-db-2",
      "report-sep-1",
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

describe("telecom buildMenu — Fichier actions", () => {
  it("'new-window' opens a forced-new telecom window", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "new-window").run();
    expect(ctx.openApp).toHaveBeenCalledWith("telecom", { forceNew: true });
  });

  it("'import' opens the upload app", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "import").run();
    expect(ctx.openApp).toHaveBeenCalledWith("upload");
  });

  it("'export-db' dispatches the 'export' command", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "export-db").run();
    expect(ctx.command).toHaveBeenCalledWith("export");
  });

  it("'close' closes the focused window", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "close").run();
    expect(ctx.closeWindow).toHaveBeenCalledTimes(1);
  });
});

// ─── Rapport actions ──────────────────────────────────────────────────────────

describe("telecom buildMenu — Rapport actions", () => {
  it("'refresh-history' dispatches the 'refresh-history' command", () => {
    const ctx = makeMenuContext();
    const report = findGroup(buildMenu(ctx), "report");
    getAction(report?.items ?? [], "refresh-history").run();
    expect(ctx.command).toHaveBeenCalledWith("refresh-history");
  });

  it("'export-db-2' dispatches the same 'export' command as the Fichier menu's 'export-db'", () => {
    const ctx = makeMenuContext();
    const report = findGroup(buildMenu(ctx), "report");
    getAction(report?.items ?? [], "export-db-2").run();
    expect(ctx.command).toHaveBeenCalledWith("export");
  });

  it("'ask-moudir' asks Moudir to summarize the telecom KPIs", () => {
    const ctx = makeMenuContext();
    const report = findGroup(buildMenu(ctx), "report");
    getAction(report?.items ?? [], "ask-moudir").run();
    expect(ctx.askMoudir).toHaveBeenCalledWith(
      "Résume les indicateurs clés du rapport télécom actuel.",
    );
  });
});
