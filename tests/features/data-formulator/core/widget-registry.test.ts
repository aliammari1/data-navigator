import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWidgetRegistry } from "@/features/data-formulator/core/widget-registry";
import type { FormulatorWidget, WidgetSize } from "@/features/data-formulator/core/widget-registry";
import type { ChartSpec } from "@/features/data-formulator/core/types";

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeChartSpec(overrides: Partial<ChartSpec> = {}): ChartSpec {
  return {
    id: overrides.id ?? "chart-1",
    type: overrides.type ?? "bar",
    encodings: overrides.encodings ?? [],
    filters: overrides.filters ?? [],
    limit: overrides.limit ?? 100,
    title: overrides.title ?? "Test Chart",
  };
}

function makeWidgetInput(
  overrides: Partial<Omit<FormulatorWidget, "id" | "createdAt">> = {},
): Omit<FormulatorWidget, "id" | "createdAt"> {
  return {
    chartSpec: overrides.chartSpec ?? makeChartSpec(),
    result: overrides.result ?? null,
    title: overrides.title ?? "Widget Title",
    size: (overrides.size as WidgetSize) ?? "md",
    attachedTo: overrides.attachedTo ?? [],
    tableName: overrides.tableName ?? "tx",
  };
}

// ─── Store reset helper ──────────────────────────────────────────────────────

function resetStore() {
  // Merge mode (not replace) preserves the action closures that persist() wraps.
  useWidgetRegistry.setState({ widgets: [] });
}

const store = () => useWidgetRegistry.getState();

beforeEach(() => {
  resetStore();
});

// ─── Initial state ───────────────────────────────────────────────────────────

describe("initial state", () => {
  it("starts with an empty widgets array", () => {
    expect(store().widgets).toEqual([]);
  });
});

// ─── addWidget ───────────────────────────────────────────────────────────────

describe("addWidget", () => {
  it("adds a widget and assigns a generated id", () => {
    store().addWidget(makeWidgetInput());
    expect(store().widgets).toHaveLength(1);
    expect(store().widgets[0]?.id).toMatch(/^widget_\d+_[a-z0-9]+$/);
  });

  it("assigns a createdAt timestamp", () => {
    const before = Date.now();
    store().addWidget(makeWidgetInput());
    const after = Date.now();
    const widget = store().widgets[0];
    expect(widget?.createdAt).toBeGreaterThanOrEqual(before);
    expect(widget?.createdAt).toBeLessThanOrEqual(after);
  });

  it("preserves all input fields on the created widget", () => {
    const spec = makeChartSpec({ id: "c-99", title: "My Chart" });
    store().addWidget(
      makeWidgetInput({
        chartSpec: spec,
        title: "My Widget",
        size: "lg",
        attachedTo: ["page-1"],
        tableName: "orders",
      }),
    );
    const w = store().widgets[0];
    expect(w?.chartSpec).toEqual(spec);
    expect(w?.title).toBe("My Widget");
    expect(w?.size).toBe("lg");
    expect(w?.attachedTo).toEqual(["page-1"]);
    expect(w?.tableName).toBe("orders");
    expect(w?.result).toBeNull();
  });

  it("prepends new widgets so the newest is first", () => {
    store().addWidget(makeWidgetInput({ title: "First" }));
    const firstId = store().widgets[0]?.id;

    store().addWidget(makeWidgetInput({ title: "Second" }));
    expect(store().widgets[0]?.title).toBe("Second");
    expect(store().widgets[1]?.id).toBe(firstId);
  });

  it("generates unique ids for each widget", () => {
    // Use fake timers to force same timestamp, ensuring random part differentiates
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    store().addWidget(makeWidgetInput({ title: "A" }));
    store().addWidget(makeWidgetInput({ title: "B" }));
    vi.useRealTimers();
    const ids = store().widgets.map((w) => w.id);
    expect(new Set(ids).size).toBe(2);
  });
});

// ─── removeWidget ────────────────────────────────────────────────────────────

describe("removeWidget", () => {
  it("removes the widget with the given id", () => {
    store().addWidget(makeWidgetInput({ title: "ToRemove" }));
    const id = store().widgets[0]?.id as string;

    store().removeWidget(id);
    expect(store().widgets).toHaveLength(0);
  });

  it("leaves other widgets untouched when removing by id", () => {
    store().addWidget(makeWidgetInput({ title: "A" }));
    store().addWidget(makeWidgetInput({ title: "B" }));
    const ids = store().widgets.map((w) => w.id);
    const removeId = ids[0] as string;
    const keepId = ids[1] as string;

    store().removeWidget(removeId);
    expect(store().widgets).toHaveLength(1);
    expect(store().widgets[0]?.id).toBe(keepId);
  });

  it("is a no-op when the id does not match any widget", () => {
    store().addWidget(makeWidgetInput());
    store().removeWidget("nonexistent-id");
    expect(store().widgets).toHaveLength(1);
  });
});

// ─── attachToPage ────────────────────────────────────────────────────────────

describe("attachToPage", () => {
  it("appends the pageId to attachedTo when the widget id matches and page not already attached", () => {
    store().addWidget(makeWidgetInput({ attachedTo: [] }));
    const id = store().widgets[0]?.id as string;

    store().attachToPage(id, "page-overview");
    expect(store().widgets[0]?.attachedTo).toEqual(["page-overview"]);
  });

  it("does not duplicate the pageId when the page is already attached", () => {
    store().addWidget(makeWidgetInput({ attachedTo: ["page-overview"] }));
    const id = store().widgets[0]?.id as string;

    store().attachToPage(id, "page-overview");
    expect(store().widgets[0]?.attachedTo).toEqual(["page-overview"]);
  });

  it("can attach multiple pages to the same widget", () => {
    store().addWidget(makeWidgetInput({ attachedTo: [] }));
    const id = store().widgets[0]?.id as string;

    store().attachToPage(id, "page-1");
    store().attachToPage(id, "page-2");
    expect(store().widgets[0]?.attachedTo).toEqual(["page-1", "page-2"]);
  });

  it("does not modify widgets whose id does not match", () => {
    store().addWidget(makeWidgetInput({ attachedTo: [] }));
    store().addWidget(makeWidgetInput({ attachedTo: [] }));
    const ids = store().widgets.map((w) => w.id);
    const targetId = ids[0] as string;

    store().attachToPage(targetId, "page-1");
    // The second widget (ids[1]) must remain untouched
    expect(store().widgets.find((w) => w.id === ids[1])?.attachedTo).toEqual([]);
  });

  it("is a no-op when the widgetId does not match any widget", () => {
    store().addWidget(makeWidgetInput({ attachedTo: [] }));
    store().attachToPage("nonexistent", "page-1");
    expect(store().widgets[0]?.attachedTo).toEqual([]);
  });
});

// ─── detachFromPage ──────────────────────────────────────────────────────────

describe("detachFromPage", () => {
  it("removes the pageId from attachedTo when the widget id matches", () => {
    store().addWidget(makeWidgetInput({ attachedTo: ["page-1", "page-2"] }));
    const id = store().widgets[0]?.id as string;

    store().detachFromPage(id, "page-1");
    expect(store().widgets[0]?.attachedTo).toEqual(["page-2"]);
  });

  it("results in an empty attachedTo when the last page is detached", () => {
    store().addWidget(makeWidgetInput({ attachedTo: ["page-1"] }));
    const id = store().widgets[0]?.id as string;

    store().detachFromPage(id, "page-1");
    expect(store().widgets[0]?.attachedTo).toEqual([]);
  });

  it("is a no-op for pages that were never attached", () => {
    store().addWidget(makeWidgetInput({ attachedTo: ["page-1"] }));
    const id = store().widgets[0]?.id as string;

    store().detachFromPage(id, "page-999");
    expect(store().widgets[0]?.attachedTo).toEqual(["page-1"]);
  });

  it("does not modify widgets whose id does not match", () => {
    store().addWidget(makeWidgetInput({ attachedTo: ["page-1"] }));
    store().addWidget(makeWidgetInput({ attachedTo: ["page-1"] }));
    const ids = store().widgets.map((w) => w.id);

    store().detachFromPage(ids[0] as string, "page-1");
    expect(store().widgets.find((w) => w.id === ids[1])?.attachedTo).toEqual(["page-1"]);
  });

  it("is a no-op when the widgetId does not match any widget", () => {
    store().addWidget(makeWidgetInput({ attachedTo: ["page-1"] }));
    store().detachFromPage("nonexistent", "page-1");
    expect(store().widgets[0]?.attachedTo).toEqual(["page-1"]);
  });
});

// ─── updateWidget ────────────────────────────────────────────────────────────

describe("updateWidget", () => {
  it("merges the patch into the matching widget", () => {
    store().addWidget(makeWidgetInput({ title: "Original", size: "sm" }));
    const id = store().widgets[0]?.id as string;

    store().updateWidget(id, { title: "Updated", size: "full" });
    const w = store().widgets[0];
    expect(w?.title).toBe("Updated");
    expect(w?.size).toBe("full");
  });

  it("preserves fields not included in the patch", () => {
    store().addWidget(makeWidgetInput({ title: "Keep Me", tableName: "orders" }));
    const id = store().widgets[0]?.id as string;

    store().updateWidget(id, { size: "wide" });
    expect(store().widgets[0]?.title).toBe("Keep Me");
    expect(store().widgets[0]?.tableName).toBe("orders");
  });

  it("does not modify widgets whose id does not match", () => {
    store().addWidget(makeWidgetInput({ title: "A" }));
    store().addWidget(makeWidgetInput({ title: "B" }));
    // widgets are prepended, so widgets[0] is "B" and widgets[1] is "A"
    const ids = store().widgets.map((w) => w.id);
    const bId = ids[0] as string; // "B" is first (most recently added)
    const aId = ids[1] as string; // "A" is second

    store().updateWidget(bId, { title: "B-updated" });
    // "A" widget should remain untouched
    expect(store().widgets.find((w) => w.id === aId)?.title).toBe("A");
  });

  it("is a no-op when the id does not match any widget", () => {
    store().addWidget(makeWidgetInput({ title: "Untouched" }));
    store().updateWidget("nonexistent", { title: "Changed" });
    expect(store().widgets[0]?.title).toBe("Untouched");
  });

  it("can update the result field from null to a QueryResult", () => {
    store().addWidget(makeWidgetInput({ result: null }));
    const id = store().widgets[0]?.id as string;

    const result = { sql: "SELECT 1", data: [{ a: 1 }], duration: 42, rowCount: 1 };
    store().updateWidget(id, { result });
    expect(store().widgets[0]?.result).toEqual(result);
  });
});

// ─── getWidgetsForPage ────────────────────────────────────────────────────────

describe("getWidgetsForPage", () => {
  it("returns an empty array when there are no widgets", () => {
    expect(store().getWidgetsForPage("page-1")).toEqual([]);
  });

  it("returns widgets attached to the given pageId", () => {
    store().addWidget(makeWidgetInput({ attachedTo: ["page-1"], title: "W1" }));
    store().addWidget(makeWidgetInput({ attachedTo: ["page-2"], title: "W2" }));

    const result = store().getWidgetsForPage("page-1");
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("W1");
  });

  it("returns multiple widgets when all are attached to the page", () => {
    store().addWidget(makeWidgetInput({ attachedTo: ["page-1"], title: "A" }));
    store().addWidget(makeWidgetInput({ attachedTo: ["page-1"], title: "B" }));

    const result = store().getWidgetsForPage("page-1");
    expect(result).toHaveLength(2);
  });

  it("returns an empty array when no widgets are attached to the given pageId", () => {
    store().addWidget(makeWidgetInput({ attachedTo: ["page-2"], title: "Elsewhere" }));

    expect(store().getWidgetsForPage("page-1")).toEqual([]);
  });

  it("returns a widget that is attached to multiple pages for each page query", () => {
    store().addWidget(makeWidgetInput({ attachedTo: ["page-1", "page-2"], title: "Multi" }));

    expect(store().getWidgetsForPage("page-1")).toHaveLength(1);
    expect(store().getWidgetsForPage("page-2")).toHaveLength(1);
    expect(store().getWidgetsForPage("page-3")).toHaveLength(0);
  });

  it("reflects attachToPage and detachFromPage changes immediately", () => {
    store().addWidget(makeWidgetInput({ attachedTo: [] }));
    const id = store().widgets[0]?.id as string;

    store().attachToPage(id, "page-1");
    expect(store().getWidgetsForPage("page-1")).toHaveLength(1);

    store().detachFromPage(id, "page-1");
    expect(store().getWidgetsForPage("page-1")).toHaveLength(0);
  });
});

// ─── pinWidget / unpinWidget / getPinnedWidgets ──────────────────────────────

describe("pinWidget", () => {
  it("sets pinnedAt to a timestamp on the matching widget", () => {
    store().addWidget(makeWidgetInput({ title: "Pin me" }));
    const id = store().widgets[0]?.id as string;

    const before = Date.now();
    store().pinWidget(id);
    const after = Date.now();

    const pinnedAt = store().widgets[0]?.pinnedAt;
    expect(pinnedAt).toBeGreaterThanOrEqual(before);
    expect(pinnedAt).toBeLessThanOrEqual(after);
  });

  it("does not modify widgets whose id does not match", () => {
    store().addWidget(makeWidgetInput({ title: "A" }));
    store().addWidget(makeWidgetInput({ title: "B" }));
    const ids = store().widgets.map((w) => w.id);

    store().pinWidget(ids[0] as string);
    expect(store().widgets.find((w) => w.id === ids[1])?.pinnedAt).toBeUndefined();
  });

  it("is a no-op when the id does not match any widget", () => {
    store().addWidget(makeWidgetInput());
    store().pinWidget("nonexistent-id");
    expect(store().widgets[0]?.pinnedAt).toBeUndefined();
  });
});

describe("unpinWidget", () => {
  it("clears pinnedAt on the matching widget", () => {
    store().addWidget(makeWidgetInput({ title: "Unpin me" }));
    const id = store().widgets[0]?.id as string;
    store().pinWidget(id);
    expect(store().widgets[0]?.pinnedAt).toBeDefined();

    store().unpinWidget(id);
    expect(store().widgets[0]?.pinnedAt).toBeUndefined();
  });

  it("does not modify widgets whose id does not match", () => {
    store().addWidget(makeWidgetInput({ title: "A" }));
    store().addWidget(makeWidgetInput({ title: "B" }));
    const ids = store().widgets.map((w) => w.id);
    store().pinWidget(ids[0] as string);
    store().pinWidget(ids[1] as string);

    store().unpinWidget(ids[0] as string);
    expect(store().widgets.find((w) => w.id === ids[1])?.pinnedAt).toBeDefined();
  });

  it("is a no-op when the id does not match any widget", () => {
    store().addWidget(makeWidgetInput());
    const id = store().widgets[0]?.id as string;
    store().pinWidget(id);
    const pinnedAt = store().widgets[0]?.pinnedAt;

    store().unpinWidget("nonexistent-id");
    expect(store().widgets[0]?.pinnedAt).toBe(pinnedAt);
  });
});

describe("getPinnedWidgets", () => {
  it("returns an empty array when no widgets are pinned", () => {
    store().addWidget(makeWidgetInput());
    expect(store().getPinnedWidgets()).toEqual([]);
  });

  it("returns only the widgets whose pinnedAt is set", () => {
    store().addWidget(makeWidgetInput({ title: "Pinned" }));
    store().addWidget(makeWidgetInput({ title: "Not pinned" }));
    const ids = store().widgets.map((w) => w.id);
    const pinnedId = ids.find((_, i) => store().widgets[i]?.title === "Pinned") as string;
    store().pinWidget(pinnedId);

    const pinned = store().getPinnedWidgets();
    expect(pinned).toHaveLength(1);
    expect(pinned[0]?.title).toBe("Pinned");
  });

  it("reflects unpinWidget immediately (widget drops out of the pinned list)", () => {
    store().addWidget(makeWidgetInput({ title: "Toggle" }));
    const id = store().widgets[0]?.id as string;

    store().pinWidget(id);
    expect(store().getPinnedWidgets()).toHaveLength(1);

    store().unpinWidget(id);
    expect(store().getPinnedWidgets()).toHaveLength(0);
  });
});

// ─── Cross-action integration ─────────────────────────────────────────────────

describe("cross-action integration", () => {
  it("full lifecycle: add → attach → update → detach → remove", () => {
    // Add
    store().addWidget(makeWidgetInput({ title: "Lifecycle" }));
    const id = store().widgets[0]?.id as string;
    expect(store().widgets).toHaveLength(1);

    // Attach
    store().attachToPage(id, "page-home");
    expect(store().getWidgetsForPage("page-home")).toHaveLength(1);

    // Update
    store().updateWidget(id, { title: "Updated Lifecycle" });
    expect(store().widgets[0]?.title).toBe("Updated Lifecycle");

    // Detach
    store().detachFromPage(id, "page-home");
    expect(store().getWidgetsForPage("page-home")).toHaveLength(0);

    // Remove
    store().removeWidget(id);
    expect(store().widgets).toHaveLength(0);
  });

  it("managing multiple widgets independently", () => {
    store().addWidget(makeWidgetInput({ title: "A" }));
    store().addWidget(makeWidgetInput({ title: "B" }));
    store().addWidget(makeWidgetInput({ title: "C" }));
    expect(store().widgets).toHaveLength(3);

    const ids = store().widgets.map((w) => w.id);
    store().attachToPage(ids[0] as string, "page-1");
    store().attachToPage(ids[2] as string, "page-1");

    const page1Widgets = store().getWidgetsForPage("page-1");
    expect(page1Widgets).toHaveLength(2);

    store().removeWidget(ids[1] as string);
    expect(store().widgets).toHaveLength(2);
    expect(store().getWidgetsForPage("page-1")).toHaveLength(2);
  });
});
