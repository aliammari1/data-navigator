import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Behavioral tests for `getAppMenuGroups`, the composer that slots an app's
 * menu contribution into the standard bar order and merges/overrides the
 * universal defaults (see the module's own doc comment for the exact rules).
 *
 * Two of the ~29 statically-imported app menu modules are mocked so the suite
 * can drive `composeAppGroups`'s override/merge/containment rules with fully
 * controlled inputs, without depending on (or being broken by future edits to)
 * any real app's actual menu content:
 *   - "settings" → a controllable stand-in builder (see `h.settingsImpl`)
 *   - "diagnostics" → always throws, to exercise `safeBuild`'s containment
 *
 * Every other app module (moudir, telecom, geo, …) is left real: they are pure,
 * side-effect-free `(ctx) => MenuGroup[]` functions (lucide-react icons + a
 * type-only import), so importing them for real is safe and keeps this suite
 * honest about the actual composition graph.
 *
 * `@/features/desktop/store/desktop-store` is mocked to a minimal data-only
 * stand-in (as in universal.test.ts) since `universal.tsx` only reads its
 * WALLPAPERS/GLASS_PALETTES constants.
 */

const h = vi.hoisted(() => ({
  settingsImpl: (_ctx: unknown) => [] as unknown[],
}));

vi.mock("@/features/desktop/core/menu/apps/settings", () => ({
  buildMenu: (ctx: unknown) => h.settingsImpl(ctx),
}));

vi.mock("@/features/desktop/core/menu/apps/diagnostics", () => ({
  buildMenu: () => {
    throw new Error("diagnostics builder exploded");
  },
}));

vi.mock("@/features/desktop/store/desktop-store", () => ({
  WALLPAPERS: [{ id: "dawn", label: "Aube", css: "var(--wp-dawn)" }],
  GLASS_PALETTES: [{ id: "sand", label: "Cyan", swatch: "g1" }],
}));

import { getAppMenuGroups } from "@/features/desktop/core/menu/menu-composer";
import type { MenuContext, MenuGroup, MenuItem } from "@/features/desktop/core/menu/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<MenuContext> = {}): MenuContext {
  return {
    appId: null,
    windowId: null,
    title: "Bureau",
    hue: 28,
    isMaximized: false,
    isPinnedOnTop: false,
    pages: [],
    activePageId: null,

    closeWindow: vi.fn(),
    minimizeWindow: vi.fn(),
    toggleMaximize: vi.fn(),
    togglePinOnTop: vi.fn(),
    snapshot: vi.fn(),

    openApp: vi.fn(),
    cascadeArrange: vi.fn(),
    closeAll: vi.fn(),
    exitDesktop: vi.fn(),
    askMoudir: vi.fn(),

    theme: "system",
    setTheme: vi.fn(),
    wallpaper: "dawn",
    setWallpaper: vi.fn(),
    glassPalette: "sand",
    setGlassPalette: vi.fn(),

    command: vi.fn(),
    setActivePage: vi.fn(),

    ...overrides,
  };
}

function ids(groups: MenuGroup[]): string[] {
  return groups.map((g) => g.id);
}
function group(groups: MenuGroup[], id: string): MenuGroup {
  const g = groups.find((x) => x.id === id);
  if (!g) throw new Error(`expected a group with id "${id}"`);
  return g;
}
function itemIds(items: MenuItem[]): string[] {
  return items.map((i) => i.id);
}

const sep = (id: string): MenuItem => ({ kind: "separator", id });
const act = (id: string): MenuItem => ({ id, label: id, run: () => {} });

beforeEach(() => {
  h.settingsImpl = () => [];
  vi.clearAllMocks();
});

// ─── Empty desktop (no focused app) ──────────────────────────────────────────

describe("getAppMenuGroups — no focused app (appId null)", () => {
  it("returns the desktop 'Bureau' set: app, file, view, window, help", () => {
    const groups = getAppMenuGroups(makeCtx({ appId: null }));
    expect(ids(groups)).toEqual(["app", "file", "view", "window", "help"]);
  });

  it("the leading group label is 'Bureau'", () => {
    const groups = getAppMenuGroups(makeCtx({ appId: null }));
    expect(group(groups, "app").label).toBe("Bureau");
  });
});

// ─── Unknown app id (no registered builder) ──────────────────────────────────

describe("getAppMenuGroups — appId with no registered builder", () => {
  it("falls back to the full universal set with no extra app-specific groups", () => {
    const groups = getAppMenuGroups(makeCtx({ appId: "not-a-real-app", title: "Ghost App" }));
    expect(ids(groups)).toEqual(["app", "file", "edit", "view", "window", "help"]);
  });

  it("the leading group label follows ctx.title, not the app registry", () => {
    const groups = getAppMenuGroups(makeCtx({ appId: "not-a-real-app", title: "Ghost App" }));
    expect(group(groups, "app").label).toBe("Ghost App");
  });
});

// ─── file / edit: full replacement (not merge) ───────────────────────────────

describe("getAppMenuGroups — 'file' and 'edit' override rule", () => {
  it("an app's 'file' group entirely REPLACES the universal Fichier (no universal items bleed through)", () => {
    h.settingsImpl = () => [
      { id: "file", label: "Fichier", items: [act("only-mine")] } satisfies MenuGroup,
    ];
    const groups = getAppMenuGroups(makeCtx({ appId: "settings" }));
    expect(itemIds(group(groups, "file").items)).toEqual(["only-mine"]);
  });

  it("without an app 'file' group, the universal Fichier fallback is used", () => {
    h.settingsImpl = () => [];
    const groups = getAppMenuGroups(makeCtx({ appId: "settings" }));
    // Universal fallback always includes "import" and "export-report".
    expect(itemIds(group(groups, "file").items)).toContain("import");
  });

  it("an app's 'edit' group entirely REPLACES the universal Édition (no universal items bleed through)", () => {
    h.settingsImpl = () => [
      { id: "edit", label: "Édition", items: [act("only-mine")] } satisfies MenuGroup,
    ];
    const groups = getAppMenuGroups(makeCtx({ appId: "settings" }));
    expect(itemIds(group(groups, "edit").items)).toEqual(["only-mine"]);
  });

  it("without an app 'edit' group, the universal Édition (undo/redo/…) is used", () => {
    h.settingsImpl = () => [];
    const groups = getAppMenuGroups(makeCtx({ appId: "settings" }));
    expect(itemIds(group(groups, "edit").items)).toContain("undo");
  });
});

// ─── view / help: prepend merge ──────────────────────────────────────────────

describe("getAppMenuGroups — 'view' and 'help' prepend rule", () => {
  it("an app's 'view' items are PREPENDED before the universal Affichage items, joined by a separator", () => {
    h.settingsImpl = () => [
      { id: "view", label: "Affichage", items: [act("app-view-item")] } satisfies MenuGroup,
    ];
    const groups = getAppMenuGroups(makeCtx({ appId: "settings" }));
    const items = itemIds(group(groups, "view").items);
    expect(items[0]).toBe("app-view-item");
    expect(items[1]).toBe("view-merge-sep");
    // Universal Affichage always includes the "theme" submenu after the merge separator.
    expect(items).toContain("theme");
  });

  it("an app's 'help' items are PREPENDED before the universal Aide items, joined by a separator", () => {
    h.settingsImpl = () => [
      { id: "help", label: "Aide", items: [act("app-help-item")] } satisfies MenuGroup,
    ];
    const groups = getAppMenuGroups(makeCtx({ appId: "settings" }));
    const items = itemIds(group(groups, "help").items);
    expect(items[0]).toBe("app-help-item");
    expect(items[1]).toBe("help-merge-sep");
    expect(items).toContain("ask-moudir");
  });

  it("without an app 'view'/'help' group, the universal groups are used unmerged (no stray separator)", () => {
    h.settingsImpl = () => [];
    const groups = getAppMenuGroups(makeCtx({ appId: "settings" }));
    expect(itemIds(group(groups, "view").items)).not.toContain("view-merge-sep");
    expect(itemIds(group(groups, "help").items)).not.toContain("help-merge-sep");
  });

  it("an app 'view'/'help' group with zero items after cleaning does not merge (prepend is skipped, base group is untouched)", () => {
    h.settingsImpl = () => [{ id: "view", label: "Affichage", items: [] } satisfies MenuGroup];
    const groups = getAppMenuGroups(makeCtx({ appId: "settings" }));
    expect(itemIds(group(groups, "view").items)).not.toContain("view-merge-sep");
  });
});

// ─── Other app-specific ids: inserted between View and Window ───────────────

describe("getAppMenuGroups — app-specific (non-standard) group ids", () => {
  it("an app group with a custom id is placed after 'view' and before 'window', preserving app order", () => {
    h.settingsImpl = () => [
      { id: "dashboard", label: "Tableau de bord", items: [act("a")] } satisfies MenuGroup,
      { id: "extra", label: "Extra", items: [act("b")] } satisfies MenuGroup,
    ];
    const groups = getAppMenuGroups(makeCtx({ appId: "settings" }));
    const order = ids(groups);
    const viewIdx = order.indexOf("view");
    const dashIdx = order.indexOf("dashboard");
    const extraIdx = order.indexOf("extra");
    const winIdx = order.indexOf("window");
    expect(viewIdx).toBeLessThan(dashIdx);
    expect(dashIdx).toBeLessThan(extraIdx);
    expect(extraIdx).toBeLessThan(winIdx);
  });

  it("a group with id 'app' returned by an app builder is dropped entirely (not used as the leading group, not kept as an extra group)", () => {
    h.settingsImpl = () => [
      { id: "app", label: "Hijacked", items: [act("evil")] } satisfies MenuGroup,
    ];
    const groups = getAppMenuGroups(makeCtx({ appId: "settings", title: "Paramètres" }));
    // The leading group still comes from the universal appLeadingGroup(ctx), not the app's "app" group.
    expect(group(groups, "app").label).toBe("Paramètres");
    expect(itemIds(group(groups, "app").items)).not.toContain("evil");
    // And it must not reappear as a second/duplicate group anywhere in the output.
    expect(ids(groups).filter((id) => id === "app")).toHaveLength(1);
  });
});

// ─── safeBuild: containment of a throwing builder ────────────────────────────

describe("getAppMenuGroups — a throwing app builder is contained", () => {
  it("yields the universal defaults with zero app-specific groups (no crash)", () => {
    expect(() => getAppMenuGroups(makeCtx({ appId: "diagnostics" }))).not.toThrow();
    const groups = getAppMenuGroups(makeCtx({ appId: "diagnostics", title: "Système" }));
    expect(ids(groups)).toEqual(["app", "file", "edit", "view", "window", "help"]);
  });

  it("the leading group still uses ctx.title even though the app's own builder failed", () => {
    const groups = getAppMenuGroups(makeCtx({ appId: "diagnostics", title: "Système" }));
    expect(group(groups, "app").label).toBe("Système");
  });

  it("a builder that returns a non-array value is also contained (no app-specific groups, no crash)", () => {
    // Defensive guard alongside the try/catch: some non-conforming builder could
    // return e.g. undefined instead of MenuGroup[]; safeBuild coerces this to [].
    h.settingsImpl = () => undefined as unknown as unknown[];
    expect(() => getAppMenuGroups(makeCtx({ appId: "settings" }))).not.toThrow();
    const groups = getAppMenuGroups(makeCtx({ appId: "settings", title: "Paramètres" }));
    expect(ids(groups)).toEqual(["app", "file", "edit", "view", "window", "help"]);
  });
});

// ─── cleanItems: separator collapsing ────────────────────────────────────────

describe("getAppMenuGroups — cleanItems collapses separators", () => {
  it("drops a leading separator", () => {
    h.settingsImpl = () => [
      { id: "extra", label: "Extra", items: [sep("lead"), act("a")] } satisfies MenuGroup,
    ];
    const groups = getAppMenuGroups(makeCtx({ appId: "settings" }));
    expect(itemIds(group(groups, "extra").items)).toEqual(["a"]);
  });

  it("drops a trailing separator", () => {
    h.settingsImpl = () => [
      { id: "extra", label: "Extra", items: [act("a"), sep("trail")] } satisfies MenuGroup,
    ];
    const groups = getAppMenuGroups(makeCtx({ appId: "settings" }));
    expect(itemIds(group(groups, "extra").items)).toEqual(["a"]);
  });

  it("collapses consecutive duplicate separators into one", () => {
    h.settingsImpl = () => [
      {
        id: "extra",
        label: "Extra",
        items: [act("a"), sep("s1"), sep("s2"), sep("s3"), act("b")],
      } satisfies MenuGroup,
    ];
    const groups = getAppMenuGroups(makeCtx({ appId: "settings" }));
    expect(itemIds(group(groups, "extra").items)).toEqual(["a", "s1", "b"]);
  });

  it("drops a group entirely (from the final output) when every item is a separator", () => {
    h.settingsImpl = () => [
      { id: "extra", label: "Extra", items: [sep("s1"), sep("s2")] } satisfies MenuGroup,
    ];
    const groups = getAppMenuGroups(makeCtx({ appId: "settings" }));
    expect(ids(groups)).not.toContain("extra");
  });

  it("drops a group entirely when it has zero items to begin with", () => {
    h.settingsImpl = () => [{ id: "extra", label: "Extra", items: [] } satisfies MenuGroup];
    const groups = getAppMenuGroups(makeCtx({ appId: "settings" }));
    expect(ids(groups)).not.toContain("extra");
  });

  it("cleans separators inside the universal groups too (e.g. Fenêtre keeps its internal separator once)", () => {
    // windowGroup always has exactly one interior separator ("window-sep-1"); this
    // just confirms cleanItems does not accidentally strip a legitimate interior one.
    const groups = getAppMenuGroups(makeCtx({ appId: null }));
    expect(itemIds(group(groups, "window").items)).toContain("window-sep-1");
  });
});

// ─── A well-behaved real app: full composition sanity check ─────────────────

describe("getAppMenuGroups — a real app builder composes correctly end-to-end", () => {
  it("moudir-chat's declared groups slot into the standard order around the universal defaults", () => {
    const groups = getAppMenuGroups(makeCtx({ appId: "moudir-chat", title: "Moudir" }));
    const order = ids(groups);
    // Standard positions must always be present, in this relative order.
    expect(order[0]).toBe("app");
    expect(order).toContain("file");
    expect(order).toContain("view");
    expect(order[order.length - 2]).toBe("window");
    expect(order[order.length - 1]).toBe("help");
  });
});
