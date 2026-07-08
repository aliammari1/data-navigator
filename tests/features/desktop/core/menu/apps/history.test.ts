import { describe, expect, it } from "vitest";

import { buildMenu } from "@/features/desktop/core/menu/apps/history";
import { findGroup, findItem, makeMenuContext, runAction } from "./_helpers";

/**
 * Behavioral test suite for the "history" (Journal d'activité) app's menu builder.
 */

describe("history buildMenu — structure", () => {
  it("returns the file and journal groups in order", () => {
    const groups = buildMenu(makeMenuContext());
    expect(groups.map((g) => g.id)).toEqual(["file", "journal"]);
  });

  it("labels the groups in French", () => {
    const groups = buildMenu(makeMenuContext());
    expect(findGroup(groups, "file")?.label).toBe("Fichier");
    expect(findGroup(groups, "journal")?.label).toBe("Journal");
  });

  it("nests the three export formats under the 'export' submenu", () => {
    const groups = buildMenu(makeMenuContext());
    const file = findGroup(groups, "file")!;
    const exportItem = findItem(file.items, "export");
    expect(exportItem?.kind).toBe("submenu");
    const nested = (exportItem as { items: { id: string }[] }).items;
    expect(nested.map((i) => i.id)).toEqual(["export-csv", "export-json", "export-xlsx"]);
  });

  it("includes a structural filter label item in the journal group", () => {
    const groups = buildMenu(makeMenuContext());
    const journal = findGroup(groups, "journal")!;
    const label = findItem(journal.items, "filter-label");
    expect(label?.kind).toBe("label");
    expect((label as { label: string }).label).toBe("Filtrer par source");
  });
});

describe("history buildMenu — file group actions", () => {
  it("new-window opens history in a forced-new window", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "file")!.items, "new-window");
    expect(ctx.openApp).toHaveBeenCalledWith("history", { forceNew: true });
  });

  it.each([
    ["export-csv", "csv"],
    ["export-json", "json"],
    ["export-xlsx", "xlsx"],
  ])("%s runs ctx.command('export', { format: '%s' })", (id, format) => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "file")!.items, id);
    expect(ctx.command).toHaveBeenCalledWith("export", { format });
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

describe("history buildMenu — journal group actions", () => {
  it.each([
    ["filter-all", "all"],
    ["filter-activity", "activity"],
    ["filter-dataset", "dataset"],
    ["filter-transform", "transform"],
    ["filter-query", "query"],
  ])("%s runs ctx.command('filter', { source: '%s' })", (id, source) => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "journal")!.items, id);
    expect(ctx.command).toHaveBeenCalledWith("filter", { source });
  });

  it("clear-search runs ctx.command('search', { query: '' })", () => {
    const ctx = makeMenuContext();
    const groups = buildMenu(ctx);
    runAction(findGroup(groups, "journal")!.items, "clear-search");
    expect(ctx.command).toHaveBeenCalledWith("search", { query: "" });
  });
});
