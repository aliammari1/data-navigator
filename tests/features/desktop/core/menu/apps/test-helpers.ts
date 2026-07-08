import { vi } from "vitest";
import type { MenuActionItem, MenuContext, MenuGroup, MenuItem } from "@/features/desktop/core/menu/types";

/**
 * Builds a fully-mocked {@link MenuContext} for testing the app-specific
 * `buildMenu` builders under `src/features/desktop/core/menu/apps/*`.
 *
 * Every method is a `vi.fn()` so a test can assert exactly which desktop
 * contract a menu item's `run()`/`onToggle()`/`onSelect()` invokes and with
 * what arguments — that is the actual behaviour these pure, declarative
 * wiring files have. Pass `overrides` to customize specific fields (e.g.
 * `activePageId`) for a given test.
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
export function findGroup(groups: MenuGroup[], groupId: string): MenuGroup | undefined {
  return groups.find((g) => g.id === groupId);
}

/** Finds a menu item by id, recursing into submenus. */
export function findItem(items: MenuItem[], itemId: string): MenuItem | undefined {
  for (const item of items) {
    if (item.id === itemId) return item;
    if (item.kind === "submenu") {
      const found = findItem(item.items, itemId);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Finds an item by id and asserts it is a normal action item (kind
 * omitted or "action"). All 10 app menu files in this coverage wave use only
 * action/separator/submenu item kinds — no checkbox/radio items — so this is
 * the only item-kind helper these suites need.
 */
export function getAction(items: MenuItem[], itemId: string): MenuActionItem {
  const item = findItem(items, itemId);
  if (!item) {
    throw new Error(`menu item not found: "${itemId}"`);
  }
  if (item.kind && item.kind !== "action") {
    throw new Error(`menu item "${itemId}" is not an action item (kind="${item.kind}")`);
  }
  return item as MenuActionItem;
}
