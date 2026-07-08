import { vi } from "vitest";
import type {
  MenuActionItem,
  MenuContext,
  MenuGroup,
  MenuItem,
  MenuSubmenuItem,
} from "@/features/desktop/core/menu/types";

/**
 * Shared test helpers for the `menu/apps/*` `buildMenu` suites.
 *
 * Every app menu module exports a PURE `buildMenu: AppMenuBuilder` — it takes a
 * {@link MenuContext} and returns declarative {@link MenuGroup}[] data (no
 * rendering). These helpers build a fully-mocked context (every ctx method is a
 * `vi.fn()` spy) and give small, typed lookups so each suite can assert both the
 * declared menu shape (group/item ids + labels) AND the real behaviour wired to
 * each item (`run()` calling the right ctx method with the right arguments).
 */

/** Builds a fully-mocked {@link MenuContext}. Pass `overrides` to customize any field. */
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

    theme: "light",
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

/** Finds a top-level menu group by id (undefined if absent — assert with `toBeDefined()`). */
export function findGroup(groups: MenuGroup[], id: string): MenuGroup | undefined {
  return groups.find((g) => g.id === id);
}

/** Finds an item by id within a group's (or submenu's) item list. */
export function findItem(items: MenuItem[], id: string): MenuItem | undefined {
  return items.find((i) => i.id === id);
}

/**
 * Finds an action item by id and asserts it really is an action item
 * (`kind` omitted or `"action"`), returning it typed so `.run()` is callable.
 * Throws (failing the test with a clear message) if the id is missing or the
 * item is a different kind.
 */
export function getAction(items: MenuItem[], id: string): MenuActionItem {
  const item = findItem(items, id);
  if (!item) throw new Error(`menu item "${id}" not found`);
  if (item.kind !== undefined && item.kind !== "action") {
    throw new Error(`menu item "${id}" is kind "${item.kind}", not an action item`);
  }
  return item as MenuActionItem;
}

/**
 * Finds a submenu item by id and asserts its `kind` is `"submenu"`, returning
 * it typed so `.items` is accessible.
 */
export function getSubmenu(items: MenuItem[], id: string): MenuSubmenuItem {
  const item = findItem(items, id);
  if (!item) throw new Error(`menu item "${id}" not found`);
  if (item.kind !== "submenu") {
    throw new Error(`menu item "${id}" is kind "${item.kind}", not a submenu item`);
  }
  return item;
}
