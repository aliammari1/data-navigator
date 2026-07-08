import { describe, expect, it } from "vitest";

import { buildMenu } from "@/features/desktop/core/menu/apps/csv-parser";
import { findGroup, getAction, makeMenuContext } from "./test-helpers";

/**
 * Behavioral tests for the "csv-parser" app menu builder (Analyseur CSV).
 */

describe("csv-parser buildMenu — shape", () => {
  it("declares the file, data, and view groups in order", () => {
    const groups = buildMenu(makeMenuContext());
    expect(groups.map((g) => g.id)).toEqual(["file", "data", "view"]);
  });

  it("labels the groups in French", () => {
    const groups = buildMenu(makeMenuContext());
    expect(findGroup(groups, "file")?.label).toBe("Fichier");
    expect(findGroup(groups, "data")?.label).toBe("Données");
    expect(findGroup(groups, "view")?.label).toBe("Affichage");
  });
});

describe("csv-parser buildMenu — file group", () => {
  it("run() on 'new-window' opens a forced new csv-parser window", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "file")!.items, "new-window").run();
    expect(ctx.openApp).toHaveBeenCalledWith("csv-parser", { forceNew: true });
  });

  it("run() on 'import' sends the import command", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "file")!.items, "import").run();
    expect(ctx.command).toHaveBeenCalledWith("import");
  });

  it("run() on 'export-csv' sends the export-csv command", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "file")!.items, "export-csv").run();
    expect(ctx.command).toHaveBeenCalledWith("export-csv");
  });

  it("run() on 'export-xlsx' sends the export-xlsx command", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "file")!.items, "export-xlsx").run();
    expect(ctx.command).toHaveBeenCalledWith("export-xlsx");
  });

  it("run() on 'load-db' sends the load-db command", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "file")!.items, "load-db").run();
    expect(ctx.command).toHaveBeenCalledWith("load-db");
  });

  it("run() on 'close' closes the window and is danger-styled", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    const item = getAction(findGroup(groups, "file")!.items, "close");
    item.run();
    expect(ctx.closeWindow).toHaveBeenCalledTimes(1);
    expect(item.danger).toBe(true);
  });
});

describe("csv-parser buildMenu — data group", () => {
  it("run() on 'parse' sends the parse command", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "data")!.items, "parse").run();
    expect(ctx.command).toHaveBeenCalledWith("parse");
  });

  it("run() on 'paste' sends the paste command", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "data")!.items, "paste").run();
    expect(ctx.command).toHaveBeenCalledWith("paste");
  });

  it("run() on 'clear' sends the clear command and is danger-styled", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    const item = getAction(findGroup(groups, "data")!.items, "clear");
    item.run();
    expect(ctx.command).toHaveBeenCalledWith("clear");
    expect(item.danger).toBe(true);
  });
});

describe("csv-parser buildMenu — view group panel toggles", () => {
  it.each([
    ["toggle-columns", "toggle-columns"],
    ["toggle-filter", "toggle-filter"],
    ["toggle-profile", "toggle-profile"],
    ["toggle-rejects", "toggle-rejects"],
  ])("run() on '%s' sends the '%s' command", (itemId, commandId) => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    getAction(findGroup(groups, "view")!.items, itemId).run();
    expect(ctx.command).toHaveBeenCalledWith(commandId);
  });
});
