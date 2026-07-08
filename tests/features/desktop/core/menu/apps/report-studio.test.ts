import { describe, expect, it } from "vitest";

import { buildMenu } from "@/features/desktop/core/menu/apps/report-studio";

import { findGroup, getAction, getSubmenu, makeMenuContext } from "./menu-context";

/**
 * Behavioral test suite for the "report-studio" app menu (Studio de Rapports).
 *
 * `buildMenu` is a pure function of {@link MenuContext} → declarative menu
 * data. Each test asserts both the declared shape (including the nested
 * "Exporter" submenu) and the real ctx action wired to `run()`.
 */

// ─── Menu shape ───────────────────────────────────────────────────────────────

describe("report-studio buildMenu — shape", () => {
  it("declares exactly the Fichier and Rapport groups, in order", () => {
    const groups = buildMenu(makeMenuContext());
    expect(groups.map((g) => g.id)).toEqual(["file", "report"]);
  });

  it("labels the groups in French", () => {
    const groups = buildMenu(makeMenuContext());
    expect(findGroup(groups, "file")?.label).toBe("Fichier");
    expect(findGroup(groups, "report")?.label).toBe("Rapport");
  });

  it("declares the expected Fichier item ids in order, including the 'export' submenu", () => {
    const groups = buildMenu(makeMenuContext());
    const file = findGroup(groups, "file");
    expect(file?.items.map((i) => i.id)).toEqual([
      "new-window",
      "sep-export",
      "export",
      "sep-close",
      "close",
    ]);
  });

  it("declares the four export formats inside the 'export' submenu, in order", () => {
    const groups = buildMenu(makeMenuContext());
    const file = findGroup(groups, "file");
    const exportMenu = getSubmenu(file?.items ?? [], "export");
    expect(exportMenu.label).toBe("Exporter");
    expect(exportMenu.items.map((i) => i.id)).toEqual([
      "export-pptx",
      "export-docx",
      "export-pdf",
      "export-xlsx",
    ]);
  });

  it("declares the expected Rapport item ids in order", () => {
    const groups = buildMenu(makeMenuContext());
    const report = findGroup(groups, "report");
    expect(report?.items.map((i) => i.id)).toEqual([
      "generate-narrative",
      "present",
      "sep-moudir",
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

describe("report-studio buildMenu — Fichier actions", () => {
  it("'new-window' opens a forced-new report-studio window", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "new-window").run();
    expect(ctx.openApp).toHaveBeenCalledWith("report-studio", { forceNew: true });
  });

  it("'close' closes the focused window", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "close").run();
    expect(ctx.closeWindow).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["export-pptx", "export-pptx"],
    ["export-docx", "export-docx"],
    ["export-pdf", "export-pdf"],
    ["export-xlsx", "export-xlsx"],
  ] as const)("'%s' dispatches the '%s' command", (itemId, expectedCommand) => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    const exportMenu = getSubmenu(file?.items ?? [], "export");
    getAction(exportMenu.items, itemId).run();
    expect(ctx.command).toHaveBeenCalledWith(expectedCommand);
  });
});

// ─── Rapport actions ──────────────────────────────────────────────────────────

describe("report-studio buildMenu — Rapport actions", () => {
  it("'generate-narrative' dispatches the 'generate-narrative' command", () => {
    const ctx = makeMenuContext();
    const report = findGroup(buildMenu(ctx), "report");
    getAction(report?.items ?? [], "generate-narrative").run();
    expect(ctx.command).toHaveBeenCalledWith("generate-narrative");
  });

  it("'present' dispatches the 'present' command", () => {
    const ctx = makeMenuContext();
    const report = findGroup(buildMenu(ctx), "report");
    getAction(report?.items ?? [], "present").run();
    expect(ctx.command).toHaveBeenCalledWith("present");
  });

  it("'ask-moudir' asks Moudir to summarize the report", () => {
    const ctx = makeMenuContext();
    const report = findGroup(buildMenu(ctx), "report");
    getAction(report?.items ?? [], "ask-moudir").run();
    expect(ctx.askMoudir).toHaveBeenCalledWith(
      "Analyse le rapport quotidien des transactions et résume les points clés.",
    );
  });
});
