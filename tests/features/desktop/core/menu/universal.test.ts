import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Behavioral tests for the universal menu groups shared by every app
 * (Fichier fallback, Édition, Affichage, Fenêtre, Aide, and the empty-desktop
 * "Bureau" set). These are pure functions of a {@link MenuContext} — no
 * rendering involved — so each test builds a mock context, calls the builder,
 * and both inspects the returned data AND invokes each item's callback to
 * confirm it drives the right context method with the right arguments.
 *
 * `@/features/desktop/store/desktop-store` is mocked to a minimal data-only
 * stand-in so this suite never pulls in the real persisted zustand store (SQLite
 * write-through, app-registry, layout, …) — `universal.tsx` only needs the
 * WALLPAPERS/GLASS_PALETTES constants from it.
 */

vi.mock("@/features/desktop/store/desktop-store", () => ({
  WALLPAPERS: [
    { id: "dawn", label: "Aube", css: "var(--wp-dawn)" },
    { id: "paper", label: "Papier", css: "var(--wp-paper)" },
  ],
  GLASS_PALETTES: [
    { id: "sand", label: "Cyan", swatch: "g1" },
    { id: "amber", label: "Azur", swatch: "g2" },
  ],
}));

import type {
  MenuActionItem,
  MenuCheckboxItem,
  MenuContext,
  MenuItem,
  MenuRadioGroupItem,
} from "@/features/desktop/core/menu/types";
import {
  appLeadingGroup,
  desktopMenuGroups,
  editGroup,
  helpGroup,
  universalFileGroup,
  viewGroup,
  windowGroup,
} from "@/features/desktop/core/menu/universal";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<MenuContext> = {}): MenuContext {
  return {
    appId: "telecom",
    windowId: "win-1",
    title: "Rapport Télécom",
    hue: 18,
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

function action(item: MenuItem | undefined): MenuActionItem {
  return item as MenuActionItem;
}
function checkbox(item: MenuItem | undefined): MenuCheckboxItem {
  return item as MenuCheckboxItem;
}
function radio(item: MenuItem | undefined): MenuRadioGroupItem {
  return item as MenuRadioGroupItem;
}
function findId(items: MenuItem[], id: string): MenuItem | undefined {
  return items.find((i) => i.id === id);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── appLeadingGroup ──────────────────────────────────────────────────────────

describe("appLeadingGroup", () => {
  it("is emphasized and labeled with the context's title", () => {
    const ctx = makeCtx({ title: "Studio IA — Moudir" });
    const group = appLeadingGroup(ctx);
    expect(group.id).toBe("app");
    expect(group.emphasized).toBe(true);
    expect(group.label).toBe("Studio IA — Moudir");
  });

  it("lists preferences, about-help, hide, quit-classic, and close ids in order", () => {
    const group = appLeadingGroup(makeCtx());
    const ids = group.items.map((i) => i.id);
    expect(ids).toEqual([
      "preferences",
      "about-help",
      "app-sep-1",
      "hide",
      "app-sep-2",
      "quit-classic",
      "close",
    ]);
  });

  it("preferences opens the settings app", () => {
    const ctx = makeCtx();
    action(findId(appLeadingGroup(ctx).items, "preferences")).run();
    expect(ctx.openApp).toHaveBeenCalledWith("settings");
  });

  it("about-help opens the help app and includes the app title in its label", () => {
    const ctx = makeCtx({ title: "Géographie" });
    const group = appLeadingGroup(ctx);
    expect(action(findId(group.items, "about-help")).label).toBe("Aide de Géographie");
    action(findId(group.items, "about-help")).run();
    expect(ctx.openApp).toHaveBeenCalledWith("help");
  });

  it("hide calls minimizeWindow and is enabled when a window is focused", () => {
    const ctx = makeCtx({ windowId: "win-1" });
    const hide = action(findId(appLeadingGroup(ctx).items, "hide"));
    expect(hide.disabled).toBe(false);
    hide.run();
    expect(ctx.minimizeWindow).toHaveBeenCalledTimes(1);
  });

  it("hide is disabled when no window is focused", () => {
    const ctx = makeCtx({ windowId: null });
    expect(action(findId(appLeadingGroup(ctx).items, "hide")).disabled).toBe(true);
  });

  it("quit-classic calls exitDesktop", () => {
    const ctx = makeCtx();
    action(findId(appLeadingGroup(ctx).items, "quit-classic")).run();
    expect(ctx.exitDesktop).toHaveBeenCalledTimes(1);
  });

  it("close calls closeWindow, is danger-styled, and is disabled without a focused window", () => {
    const ctx = makeCtx({ windowId: null });
    const close = action(findId(appLeadingGroup(ctx).items, "close"));
    expect(close.danger).toBe(true);
    expect(close.disabled).toBe(true);
    close.run();
    expect(ctx.closeWindow).toHaveBeenCalledTimes(1);
  });
});

// ─── universalFileGroup ───────────────────────────────────────────────────────

describe("universalFileGroup", () => {
  it("includes a 'new-window' item that reopens the current app when appId is set", () => {
    const ctx = makeCtx({ appId: "telecom" });
    const group = universalFileGroup(ctx);
    const item = action(findId(group.items, "new-window"));
    expect(item).toBeDefined();
    item.run();
    expect(ctx.openApp).toHaveBeenCalledWith("telecom", { forceNew: true });
  });

  it("omits 'new-window' entirely when appId is null (empty desktop)", () => {
    const ctx = makeCtx({ appId: null });
    const group = universalFileGroup(ctx);
    expect(findId(group.items, "new-window")).toBeUndefined();
  });

  it("import opens the upload app", () => {
    const ctx = makeCtx();
    action(findId(universalFileGroup(ctx).items, "import")).run();
    expect(ctx.openApp).toHaveBeenCalledWith("upload");
  });

  it("export-report opens report-studio with the export intent prop", () => {
    const ctx = makeCtx();
    action(findId(universalFileGroup(ctx).items, "export-report")).run();
    expect(ctx.openApp).toHaveBeenCalledWith("report-studio", { props: { intent: "export" } });
  });

  it("close calls closeWindow and is disabled without a focused window", () => {
    const ctx = makeCtx({ windowId: null });
    const close = action(findId(universalFileGroup(ctx).items, "close"));
    expect(close.disabled).toBe(true);
    expect(close.danger).toBe(true);
    close.run();
    expect(ctx.closeWindow).toHaveBeenCalledTimes(1);
  });

  it("returns the group under id 'file' with label 'Fichier'", () => {
    const group = universalFileGroup(makeCtx());
    expect(group.id).toBe("file");
    expect(group.label).toBe("Fichier");
  });
});

// ─── editGroup ────────────────────────────────────────────────────────────────

describe("editGroup", () => {
  it("returns the group under id 'edit' with label 'Édition'", () => {
    const group = editGroup(makeCtx());
    expect(group.id).toBe("edit");
    expect(group.label).toBe("Édition");
  });

  it("lists undo/redo/cut/copy/paste/select-all with separators in order", () => {
    const ids = editGroup(makeCtx()).items.map((i) => i.id);
    expect(ids).toEqual([
      "undo",
      "redo",
      "edit-sep-1",
      "cut",
      "copy",
      "paste",
      "edit-sep-2",
      "select-all",
    ]);
  });

  it.each([
    ["undo", "undo"],
    ["redo", "redo"],
    ["cut", "cut"],
    ["copy", "copy"],
    ["paste", "paste"],
    ["select-all", "selectAll"],
  ])("%s invokes document.execCommand('%s')", (itemId, command) => {
    const execCommand = vi.fn();
    // jsdom does not implement execCommand; the module wraps the call in a
    // try/catch, so we install our own spy to observe the intended command.
    (document as unknown as { execCommand: typeof execCommand }).execCommand = execCommand;

    action(findId(editGroup(makeCtx()).items, itemId)).run();

    expect(execCommand).toHaveBeenCalledWith(command);
  });

  it("does not throw when document.execCommand is unavailable (real jsdom behavior)", () => {
    // Restore the un-implemented jsdom default (no execCommand at all) to
    // characterize the try/catch containment the module relies on.
    delete (document as unknown as { execCommand?: unknown }).execCommand;
    expect(() => action(findId(editGroup(makeCtx()).items, "cut")).run()).not.toThrow();
  });
});

// ─── viewGroup ────────────────────────────────────────────────────────────────

describe("viewGroup", () => {
  it("returns the group under id 'view' with label 'Affichage'", () => {
    const group = viewGroup(makeCtx());
    expect(group.id).toBe("view");
    expect(group.label).toBe("Affichage");
  });

  it("omits the pages section when ctx.pages is empty", () => {
    const group = viewGroup(makeCtx({ pages: [] }));
    expect(findId(group.items, "pages-label")).toBeUndefined();
    expect(findId(group.items, "pages")).toBeUndefined();
  });

  it("includes a pages label + radio group (with a trailing separator) when ctx.pages is non-empty", () => {
    const ctx = makeCtx({
      pages: [
        { id: "overview", label: "Vue d'ensemble" },
        { id: "channels", label: "Canaux" },
      ],
      activePageId: "channels",
    });
    const group = viewGroup(ctx);
    expect(findId(group.items, "pages-label")).toBeDefined();
    const pagesRadio = radio(findId(group.items, "pages"));
    expect(pagesRadio.value).toBe("channels");
    expect(pagesRadio.options.map((o) => o.value)).toEqual(["overview", "channels"]);
    expect(findId(group.items, "view-sep-pages")).toBeDefined();
  });

  it("defaults the pages radio value to the first page's id when activePageId is null", () => {
    const ctx = makeCtx({
      pages: [{ id: "overview", label: "Vue d'ensemble" }],
      activePageId: null,
    });
    const pagesRadio = radio(findId(viewGroup(ctx).items, "pages"));
    expect(pagesRadio.value).toBe("overview");
  });

  it("selecting a page calls ctx.setActivePage with the chosen page id", () => {
    const ctx = makeCtx({
      pages: [
        { id: "overview", label: "Vue d'ensemble" },
        { id: "channels", label: "Canaux" },
      ],
    });
    const pagesRadio = radio(findId(viewGroup(ctx).items, "pages"));
    pagesRadio.onSelect("channels");
    expect(ctx.setActivePage).toHaveBeenCalledWith("channels");
  });

  it("the theme submenu radio reflects ctx.theme and defaults to 'system' when undefined", () => {
    const themed = radio(
      (
        findId(viewGroup(makeCtx({ theme: "dark" })).items, "theme") as unknown as {
          items: MenuItem[];
        }
      ).items.find((i) => i.id === "theme-radio"),
    );
    expect(themed.value).toBe("dark");

    const untouched = radio(
      (
        findId(viewGroup(makeCtx({ theme: undefined })).items, "theme") as unknown as {
          items: MenuItem[];
        }
      ).items.find((i) => i.id === "theme-radio"),
    );
    expect(untouched.value).toBe("system");
  });

  it("selecting a theme option calls ctx.setTheme with the chosen value", () => {
    const ctx = makeCtx();
    const themeSubmenu = findId(viewGroup(ctx).items, "theme") as unknown as { items: MenuItem[] };
    const themeRadio = radio(themeSubmenu.items.find((i) => i.id === "theme-radio"));
    expect(themeRadio.options.map((o) => o.value)).toEqual(["light", "dark", "system"]);
    themeRadio.onSelect("dark");
    expect(ctx.setTheme).toHaveBeenCalledWith("dark");
  });

  it("the wallpaper submenu radio reflects ctx.wallpaper and lists WALLPAPERS options", () => {
    const ctx = makeCtx({ wallpaper: "paper" });
    const wallpaperSubmenu = findId(viewGroup(ctx).items, "wallpaper") as unknown as {
      items: MenuItem[];
    };
    const wallpaperRadio = radio(wallpaperSubmenu.items.find((i) => i.id === "wallpaper-radio"));
    expect(wallpaperRadio.value).toBe("paper");
    expect(wallpaperRadio.options.map((o) => o.value)).toEqual(["dawn", "paper"]);
  });

  it("selecting a wallpaper option calls ctx.setWallpaper with the chosen id", () => {
    const ctx = makeCtx();
    const wallpaperSubmenu = findId(viewGroup(ctx).items, "wallpaper") as unknown as {
      items: MenuItem[];
    };
    const wallpaperRadio = radio(wallpaperSubmenu.items.find((i) => i.id === "wallpaper-radio"));
    wallpaperRadio.onSelect("paper");
    expect(ctx.setWallpaper).toHaveBeenCalledWith("paper");
  });

  it("the palette submenu radio reflects ctx.glassPalette and lists GLASS_PALETTES options", () => {
    const ctx = makeCtx({ glassPalette: "amber" });
    const paletteSubmenu = findId(viewGroup(ctx).items, "palette") as unknown as {
      items: MenuItem[];
    };
    const paletteRadio = radio(paletteSubmenu.items.find((i) => i.id === "palette-radio"));
    expect(paletteRadio.value).toBe("amber");
    expect(paletteRadio.options.map((o) => o.value)).toEqual(["sand", "amber"]);
  });

  it("selecting a palette option calls ctx.setGlassPalette with the chosen id", () => {
    const ctx = makeCtx();
    const paletteSubmenu = findId(viewGroup(ctx).items, "palette") as unknown as {
      items: MenuItem[];
    };
    const paletteRadio = radio(paletteSubmenu.items.find((i) => i.id === "palette-radio"));
    paletteRadio.onSelect("amber");
    expect(ctx.setGlassPalette).toHaveBeenCalledWith("amber");
  });
});

// ─── windowGroup ──────────────────────────────────────────────────────────────

describe("windowGroup", () => {
  it("returns the group under id 'window' with label 'Fenêtre'", () => {
    const group = windowGroup(makeCtx());
    expect(group.id).toBe("window");
    expect(group.label).toBe("Fenêtre");
  });

  it("minimize calls minimizeWindow and is disabled without a focused window", () => {
    const ctx = makeCtx({ windowId: null });
    const item = action(findId(windowGroup(ctx).items, "minimize"));
    expect(item.disabled).toBe(true);
    item.run();
    expect(ctx.minimizeWindow).toHaveBeenCalledTimes(1);
  });

  it("zoom is labeled 'Agrandir' when not maximized and calls toggleMaximize", () => {
    const ctx = makeCtx({ isMaximized: false, windowId: "win-1" });
    const zoom = action(findId(windowGroup(ctx).items, "zoom"));
    expect(zoom.label).toBe("Agrandir");
    expect(zoom.disabled).toBe(false);
    zoom.run();
    expect(ctx.toggleMaximize).toHaveBeenCalledTimes(1);
  });

  it("zoom is labeled 'Restaurer' when maximized", () => {
    const ctx = makeCtx({ isMaximized: true });
    expect(action(findId(windowGroup(ctx).items, "zoom")).label).toBe("Restaurer");
  });

  it("pin-on-top is a checkbox reflecting isPinnedOnTop and toggles via togglePinOnTop", () => {
    const ctx = makeCtx({ isPinnedOnTop: true, windowId: "win-1" });
    const pin = checkbox(findId(windowGroup(ctx).items, "pin-on-top"));
    expect(pin.checked).toBe(true);
    expect(pin.disabled).toBe(false);
    pin.onToggle(false);
    expect(ctx.togglePinOnTop).toHaveBeenCalledTimes(1);
  });

  it("snapshot calls ctx.snapshot and is disabled without a focused window", () => {
    const ctx = makeCtx({ windowId: null });
    const item = action(findId(windowGroup(ctx).items, "snapshot"));
    expect(item.disabled).toBe(true);
    item.run();
    expect(ctx.snapshot).toHaveBeenCalledTimes(1);
  });

  it("arrange calls cascadeArrange and is always enabled", () => {
    const ctx = makeCtx({ windowId: null });
    const item = action(findId(windowGroup(ctx).items, "arrange"));
    expect(item.disabled).toBeFalsy();
    item.run();
    expect(ctx.cascadeArrange).toHaveBeenCalledTimes(1);
  });

  it("close-all calls closeAll and is danger-styled", () => {
    const ctx = makeCtx();
    const item = action(findId(windowGroup(ctx).items, "close-all"));
    expect(item.danger).toBe(true);
    item.run();
    expect(ctx.closeAll).toHaveBeenCalledTimes(1);
  });
});

// ─── helpGroup ────────────────────────────────────────────────────────────────

describe("helpGroup", () => {
  it("returns the group under id 'help' with label 'Aide'", () => {
    const group = helpGroup(makeCtx());
    expect(group.id).toBe("help");
    expect(group.label).toBe("Aide");
  });

  it("open-help opens the help app", () => {
    const ctx = makeCtx();
    action(findId(helpGroup(ctx).items, "open-help")).run();
    expect(ctx.openApp).toHaveBeenCalledWith("help");
  });

  it("ask-moudir calls ctx.askMoudir with a prompt naming the current app title", () => {
    const ctx = makeCtx({ title: "Rapport Télécom" });
    action(findId(helpGroup(ctx).items, "ask-moudir")).run();
    expect(ctx.askMoudir).toHaveBeenCalledTimes(1);
    const prompt = (ctx.askMoudir as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(prompt).toContain("Rapport Télécom");
  });
});

// ─── desktopMenuGroups (empty-desktop "Bureau") ──────────────────────────────

describe("desktopMenuGroups", () => {
  it("returns Bureau, Fichier, Affichage, Fenêtre, Aide in that order", () => {
    const ids = desktopMenuGroups(makeCtx()).map((g) => g.id);
    expect(ids).toEqual(["app", "file", "view", "window", "help"]);
  });

  it("the leading group is labeled 'Bureau' and is emphasized", () => {
    const group = desktopMenuGroups(makeCtx())[0];
    expect(group.label).toBe("Bureau");
    expect(group.emphasized).toBe(true);
  });

  it("'apps' opens the home app launcher", () => {
    const ctx = makeCtx();
    const group = desktopMenuGroups(ctx)[0];
    action(findId(group.items, "apps")).run();
    expect(ctx.openApp).toHaveBeenCalledWith("home");
  });

  it("'preferences' opens settings", () => {
    const ctx = makeCtx();
    const group = desktopMenuGroups(ctx)[0];
    action(findId(group.items, "preferences")).run();
    expect(ctx.openApp).toHaveBeenCalledWith("settings");
  });

  it("'quit-classic' calls exitDesktop", () => {
    const ctx = makeCtx();
    const group = desktopMenuGroups(ctx)[0];
    action(findId(group.items, "quit-classic")).run();
    expect(ctx.exitDesktop).toHaveBeenCalledTimes(1);
  });
});
