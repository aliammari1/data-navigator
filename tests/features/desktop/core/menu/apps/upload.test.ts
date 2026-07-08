import { describe, expect, it } from "vitest";

import { buildMenu } from "@/features/desktop/core/menu/apps/upload";

import { findGroup, getAction, makeMenuContext } from "./menu-context";

/**
 * Behavioral test suite for the "upload" app menu (Importer).
 *
 * `buildMenu` is a pure function of {@link MenuContext} → declarative menu
 * data. Each test asserts both the declared shape and the real ctx action
 * wired to `run()`.
 */

// ─── Menu shape ───────────────────────────────────────────────────────────────

describe("upload buildMenu — shape", () => {
  it("declares exactly the Fichier, Données and Aide groups, in order", () => {
    const groups = buildMenu(makeMenuContext());
    expect(groups.map((g) => g.id)).toEqual(["file", "data", "help"]);
  });

  it("labels the groups in French", () => {
    const groups = buildMenu(makeMenuContext());
    expect(findGroup(groups, "file")?.label).toBe("Fichier");
    expect(findGroup(groups, "data")?.label).toBe("Données");
    expect(findGroup(groups, "help")?.label).toBe("Aide");
  });

  it("declares the expected Fichier item ids in order", () => {
    const groups = buildMenu(makeMenuContext());
    const file = findGroup(groups, "file");
    expect(file?.items.map((i) => i.id)).toEqual([
      "import-file",
      "import-folder",
      "sep-1",
      "refresh-history",
      "clear-session",
      "sep-2",
      "close",
    ]);
  });

  it("declares the expected Données item ids in order", () => {
    const groups = buildMenu(makeMenuContext());
    const data = findGroup(groups, "data");
    expect(data?.items.map((i) => i.id)).toEqual(["open-telecom"]);
  });

  it("declares the Aide item", () => {
    const groups = buildMenu(makeMenuContext());
    const help = findGroup(groups, "help");
    expect(help?.items.map((i) => i.id)).toEqual(["import-help"]);
  });

  it("marks 'clear-session' as a danger action but 'close' as non-danger", () => {
    const groups = buildMenu(makeMenuContext());
    const file = findGroup(groups, "file");
    expect(getAction(file?.items ?? [], "clear-session").danger).toBe(true);
    expect(getAction(file?.items ?? [], "close").danger).toBeUndefined();
  });
});

// ─── Fichier actions ──────────────────────────────────────────────────────────

describe("upload buildMenu — Fichier actions", () => {
  it("'import-file' dispatches the 'import' command", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "import-file").run();
    expect(ctx.command).toHaveBeenCalledWith("import");
  });

  it("'import-folder' dispatches the 'import-folder' command", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "import-folder").run();
    expect(ctx.command).toHaveBeenCalledWith("import-folder");
  });

  it("'refresh-history' dispatches the 'refresh-history' command", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "refresh-history").run();
    expect(ctx.command).toHaveBeenCalledWith("refresh-history");
  });

  it("'clear-session' dispatches the 'clear-session' command", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "clear-session").run();
    expect(ctx.command).toHaveBeenCalledWith("clear-session");
  });

  it("'close' closes the focused window", () => {
    const ctx = makeMenuContext();
    const file = findGroup(buildMenu(ctx), "file");
    getAction(file?.items ?? [], "close").run();
    expect(ctx.closeWindow).toHaveBeenCalledTimes(1);
  });
});

// ─── Données actions ──────────────────────────────────────────────────────────

describe("upload buildMenu — Données actions", () => {
  it("'open-telecom' opens the telecom app", () => {
    const ctx = makeMenuContext();
    const data = findGroup(buildMenu(ctx), "data");
    getAction(data?.items ?? [], "open-telecom").run();
    expect(ctx.openApp).toHaveBeenCalledWith("telecom");
  });
});

// ─── Aide actions ─────────────────────────────────────────────────────────────

describe("upload buildMenu — Aide actions", () => {
  it("'import-help' asks Moudir how to import a data file", () => {
    const ctx = makeMenuContext();
    const help = findGroup(buildMenu(ctx), "help");
    getAction(help?.items ?? [], "import-help").run();
    expect(ctx.askMoudir).toHaveBeenCalledWith(
      "Comment importer un fichier de données (CSV, TSV, TXT, Parquet) dans Data Navigator ?",
    );
  });
});
