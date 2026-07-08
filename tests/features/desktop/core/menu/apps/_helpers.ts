import { vi } from "vitest";

import type { MenuContext, MenuGroup, MenuItem } from "@/features/desktop/core/menu/types";

/**
 * Builds a fully-mocked {@link MenuContext} for testing an app's `buildMenu`.
 *
 * Every method is a `vi.fn()` so tests can assert exactly which contract a
 * menu item's `run()` / `onToggle()` / `onSelect()` invokes, with what
 * arguments. Plain data fields get small, realistic defaults; pass
 * `overrides` to customize either kind of field for a specific test.
 */
export function makeMenuContext(overrides: Partial<MenuContext> = {}): MenuContext {
  return {
    appId: "test-app",
    windowId: "win-1",
    title: "Test App",
    hue: 200,
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

/** Finds a top-level menu group by id. */
export function findGroup(groups: MenuGroup[], id: string): MenuGroup | undefined {
  return groups.find((group) => group.id === id);
}

/** Recursively finds an item by id, descending into submenu items. */
export function findItem(items: MenuItem[], id: string): MenuItem | undefined {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.kind === "submenu") {
      const nested = findItem(item.items, id);
      if (nested) return nested;
    }
  }
  return undefined;
}

/** Finds an action item by id (recursively) and invokes its `run()`. Throws if missing. */
export function runAction(items: MenuItem[], id: string): void {
  const item = findItem(items, id);
  if (!item) throw new Error(`Menu item not found: ${id}`);
  if (item.kind !== undefined && item.kind !== "action") {
    throw new Error(`Menu item ${id} is not an action item (kind: ${item.kind})`);
  }
  (item as { run: () => void }).run();
}
