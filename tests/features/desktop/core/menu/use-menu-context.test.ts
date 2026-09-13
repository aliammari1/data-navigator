import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Behavioral tests for `useMenuContext`, the hook that builds the live
 * {@link MenuContext} for the focused desktop window and composes the final
 * menu groups for the bar.
 *
 * Every store/hook boundary the module touches is mocked (as in
 * commands.test.ts / context-bus.test.ts for this same feature area) so the
 * suite can drive `useFocusedWindow`'s z-order/pin/minimized selection and each
 * `MenuContext` method's wiring with fully controlled inputs:
 *   - `@/features/desktop/store/desktop-store`     → windows/pinned/wallpaper/
 *     glassPalette state + the action bundle, all spy-backed
 *   - `@/features/desktop/core/app-registry`       → `getApp`
 *   - `@/features/desktop/core/layout`             → `getDesktopCanvas`
 *   - `@/features/dashboard-shell/shell/shell-store` → `useShellActions`
 *   - `@/hooks/use-app-theme`                      → `useAppTheme`
 *   - `@/features/desktop/components/snapshots-layer` → `captureSnapshot`
 *
 * `@/features/desktop/core/menu/app-commands` (the command bus + page
 * registry) and `@/features/desktop/core/menu/menu-composer` (menu composition) are
 * left real: they have no external boundaries of their own and exercising them
 * for real is exactly what makes this an integration-shaped unit test of the
 * hook's wiring.
 */

const h = vi.hoisted(() => {
  const actions = {
    openApp: vi.fn(),
    closeWindow: vi.fn(),
    minimizeWindow: vi.fn(),
    toggleMaximize: vi.fn(),
    togglePinOnTop: vi.fn(),
    cascadeArrange: vi.fn(),
    closeAll: vi.fn(),
    setWallpaper: vi.fn(),
    setGlassPalette: vi.fn(),
  };
  return {
    windows: [] as Array<{
      id: string;
      appId: string;
      title: string;
      z: number;
      minimized: boolean;
      maximized: boolean;
      x: number;
      y: number;
      w: number;
      h: number;
    }>,
    pinned: [] as string[],
    wallpaper: "dawn",
    glassPalette: "sand",
    actions,
    getAppImpl: (_id: string) => undefined as { title: string; hue: number } | undefined,
    canvas: { w: 1000, h: 700, usableH: 600 },
    setDesktopMode: vi.fn(),
    theme: "system" as string | undefined,
    setTheme: vi.fn(),
    captureSnapshotFn: vi.fn(),
  };
});

vi.mock("@/features/desktop/store/desktop-store", () => ({
  WALLPAPERS: [{ id: "dawn", label: "Aube", css: "var(--wp-dawn)" }],
  GLASS_PALETTES: [{ id: "sand", label: "Cyan", swatch: "g1" }],
  useDesktopActions: () => h.actions,
  useDesktopWindows: () => h.windows,
  useGlassPalette: () => h.glassPalette,
  usePinnedOnTop: () => h.pinned,
  useWallpaper: () => h.wallpaper,
}));

vi.mock("@/features/desktop/core/app-registry", () => ({
  getApp: (id: string) => h.getAppImpl(id),
}));

vi.mock("@/features/desktop/core/layout", () => ({
  getDesktopCanvas: () => h.canvas,
}));

vi.mock("@/features/dashboard-shell/shell/shell-store", () => ({
  useShellActions: () => ({ setDesktopMode: h.setDesktopMode }),
}));

vi.mock("@/hooks/use-app-theme", () => ({
  useAppTheme: () => ({ theme: h.theme, setTheme: h.setTheme }),
}));

vi.mock("@/features/desktop/components/snapshots-layer", () => ({
  captureSnapshot: (partial: unknown) => h.captureSnapshotFn(partial),
}));

import { usePageStore } from "@/features/desktop/core/menu/app-commands";
import { getAppMenuGroups } from "@/features/desktop/core/menu/menu-composer";
import type { MenuGroup } from "@/features/desktop/core/menu/types";
import { useMenuContext } from "@/features/desktop/core/menu/use-menu-context";

/** Structural fingerprint of a menu-group tree (ids/labels only) — comparable
 * across two independent builder calls even though `run`/`onSelect` closures
 * are freshly allocated each call and would fail a literal deep-equal. */
function fingerprint(groups: MenuGroup[]): unknown {
  return groups.map((g) => ({
    id: g.id,
    label: g.label,
    emphasized: g.emphasized,
    itemIds: g.items.map((i) => i.id),
  }));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type MockWindow = (typeof h.windows)[number];

function makeWindow(overrides: Partial<MockWindow> & Pick<MockWindow, "id" | "appId">): MockWindow {
  return {
    title: "Untitled",
    z: 0,
    minimized: false,
    maximized: false,
    x: 0,
    y: 0,
    w: 400,
    h: 300,
    ...overrides,
  };
}

function reset() {
  h.windows = [];
  h.pinned = [];
  h.wallpaper = "dawn";
  h.glassPalette = "sand";
  h.getAppImpl = () => undefined;
  h.canvas = { w: 1000, h: 700, usableH: 600 };
  h.theme = "system";
  usePageStore.setState({ byWindow: {} });
  vi.clearAllMocks();
}

beforeEach(() => {
  reset();
});

// ─── useFocusedWindow selection ───────────────────────────────────────────────

describe("useMenuContext — focused window selection", () => {
  it("has no focused window/app when there are no open windows", () => {
    const { result } = renderHook(() => useMenuContext());
    expect(result.current.ctx.appId).toBeNull();
    expect(result.current.ctx.windowId).toBeNull();
    expect(result.current.ctx.title).toBe("Bureau");
    expect(result.current.ctx.hue).toBe(28);
    expect(result.current.ctx.isMaximized).toBe(false);
    expect(result.current.ctx.isPinnedOnTop).toBe(false);
  });

  it("focuses the highest-z non-minimized window among several", () => {
    h.windows = [
      makeWindow({ id: "a", appId: "geo", z: 1 }),
      makeWindow({ id: "b", appId: "telecom", z: 3 }),
      makeWindow({ id: "c", appId: "forecast", z: 2 }),
    ];
    const { result } = renderHook(() => useMenuContext());
    expect(result.current.ctx.windowId).toBe("b");
    expect(result.current.ctx.appId).toBe("telecom");
  });

  it("skips a minimized window even when it has the highest z", () => {
    h.windows = [
      makeWindow({ id: "a", appId: "geo", z: 5, minimized: true }),
      makeWindow({ id: "b", appId: "telecom", z: 3, minimized: false }),
    ];
    const { result } = renderHook(() => useMenuContext());
    expect(result.current.ctx.windowId).toBe("b");
  });

  it("a pinned-on-top window outranks a higher-z non-pinned window", () => {
    h.windows = [
      makeWindow({ id: "a", appId: "geo", z: 10 }),
      makeWindow({ id: "b", appId: "telecom", z: 1 }),
    ];
    h.pinned = ["b"];
    const { result } = renderHook(() => useMenuContext());
    expect(result.current.ctx.windowId).toBe("b");
  });

  it("returns null when every window is minimized", () => {
    h.windows = [makeWindow({ id: "a", appId: "geo", z: 5, minimized: true })];
    const { result } = renderHook(() => useMenuContext());
    expect(result.current.ctx.windowId).toBeNull();
    expect(result.current.ctx.appId).toBeNull();
  });
});

// ─── Derived data fields ──────────────────────────────────────────────────────

describe("useMenuContext — derived context fields", () => {
  it("prefers the focused window's own title over the app registry title", () => {
    h.windows = [makeWindow({ id: "a", appId: "geo", title: "Custom Title", z: 1 })];
    h.getAppImpl = () => ({ title: "Registry Title", hue: 99 });
    const { result } = renderHook(() => useMenuContext());
    expect(result.current.ctx.title).toBe("Custom Title");
  });

  it("falls back to the app registry title when the window's title is nullish (defensive fallback)", () => {
    // `??` only falls through on null/undefined, not on an empty string — so this
    // exercises the fallback with an actually-nullish title, which the DesktopWindow
    // type normally prevents but the context builder defends against anyway.
    h.windows = [
      makeWindow({ id: "a", appId: "geo", title: undefined as unknown as string, z: 1 }),
    ];
    h.getAppImpl = () => ({ title: "Registry Title", hue: 99 });
    const { result } = renderHook(() => useMenuContext());
    expect(result.current.ctx.title).toBe("Registry Title");
  });

  it("takes the hue from the app registry entry", () => {
    h.windows = [makeWindow({ id: "a", appId: "geo", z: 1 })];
    h.getAppImpl = () => ({ title: "Géographie", hue: 168 });
    const { result } = renderHook(() => useMenuContext());
    expect(result.current.ctx.hue).toBe(168);
  });

  it("falls back to hue 28 when the app registry has no entry for the focused app", () => {
    h.windows = [makeWindow({ id: "a", appId: "unregistered-app", z: 1 })];
    h.getAppImpl = () => undefined;
    const { result } = renderHook(() => useMenuContext());
    expect(result.current.ctx.hue).toBe(28);
  });

  it("reflects isMaximized from the focused window", () => {
    h.windows = [makeWindow({ id: "a", appId: "geo", z: 1, maximized: true })];
    const { result } = renderHook(() => useMenuContext());
    expect(result.current.ctx.isMaximized).toBe(true);
  });

  it("reflects isPinnedOnTop membership for the focused window's id", () => {
    h.windows = [makeWindow({ id: "a", appId: "geo", z: 1 })];
    h.pinned = ["a"];
    const { result } = renderHook(() => useMenuContext());
    expect(result.current.ctx.isPinnedOnTop).toBe(true);
  });

  it("isPinnedOnTop is false when the focused window's id is not in pinnedOnTop", () => {
    h.windows = [makeWindow({ id: "a", appId: "geo", z: 1 })];
    h.pinned = ["some-other-window"];
    const { result } = renderHook(() => useMenuContext());
    expect(result.current.ctx.isPinnedOnTop).toBe(false);
  });
});

// ─── Window control methods ───────────────────────────────────────────────────

describe("useMenuContext — window control methods", () => {
  it("closeWindow calls the store action with the focused windowId", () => {
    h.windows = [makeWindow({ id: "win-1", appId: "geo", z: 1 })];
    const { result } = renderHook(() => useMenuContext());
    result.current.ctx.closeWindow();
    expect(h.actions.closeWindow).toHaveBeenCalledWith("win-1");
  });

  it("minimizeWindow calls the store action with the focused windowId", () => {
    h.windows = [makeWindow({ id: "win-1", appId: "geo", z: 1 })];
    const { result } = renderHook(() => useMenuContext());
    result.current.ctx.minimizeWindow();
    expect(h.actions.minimizeWindow).toHaveBeenCalledWith("win-1");
  });

  it("toggleMaximize calls the store action with the windowId and the canvas usable box", () => {
    h.windows = [makeWindow({ id: "win-1", appId: "geo", z: 1 })];
    h.canvas = { w: 1234, h: 999, usableH: 555 };
    const { result } = renderHook(() => useMenuContext());
    result.current.ctx.toggleMaximize();
    expect(h.actions.toggleMaximize).toHaveBeenCalledWith("win-1", { w: 1234, h: 555 });
  });

  it("togglePinOnTop calls the store action with the focused windowId", () => {
    h.windows = [makeWindow({ id: "win-1", appId: "geo", z: 1 })];
    const { result } = renderHook(() => useMenuContext());
    result.current.ctx.togglePinOnTop();
    expect(h.actions.togglePinOnTop).toHaveBeenCalledWith("win-1");
  });

  it("closeWindow/minimizeWindow/toggleMaximize/togglePinOnTop are safe no-ops without a focused window", () => {
    const { result } = renderHook(() => useMenuContext());
    result.current.ctx.closeWindow();
    result.current.ctx.minimizeWindow();
    result.current.ctx.toggleMaximize();
    result.current.ctx.togglePinOnTop();
    expect(h.actions.closeWindow).not.toHaveBeenCalled();
    expect(h.actions.minimizeWindow).not.toHaveBeenCalled();
    expect(h.actions.toggleMaximize).not.toHaveBeenCalled();
    expect(h.actions.togglePinOnTop).not.toHaveBeenCalled();
  });
});

// ─── snapshot() ───────────────────────────────────────────────────────────────

describe("useMenuContext — snapshot()", () => {
  it("does nothing when no window is focused", () => {
    const { result } = renderHook(() => useMenuContext());
    result.current.ctx.snapshot();
    expect(h.captureSnapshotFn).not.toHaveBeenCalled();
  });

  it("captures the focused window as a table snapshot with the expected default size", () => {
    h.windows = [makeWindow({ id: "win-1", appId: "telecom", title: "Rapport Télécom", z: 1 })];
    const { result } = renderHook(() => useMenuContext());
    result.current.ctx.snapshot();
    expect(h.captureSnapshotFn).toHaveBeenCalledWith({
      title: "Rapport Télécom",
      kind: "table",
      appId: "telecom",
      text: "Instantané — Rapport Télécom",
      w: 300,
      h: 220,
    });
  });
});

// ─── Desktop-wide methods ─────────────────────────────────────────────────────

describe("useMenuContext — desktop-wide methods", () => {
  it("openApp forwards the appId and options to the store action", () => {
    const { result } = renderHook(() => useMenuContext());
    result.current.ctx.openApp("geo", { forceNew: true });
    expect(h.actions.openApp).toHaveBeenCalledWith("geo", { forceNew: true });
  });

  it("cascadeArrange calls the store action with the canvas usable box", () => {
    h.canvas = { w: 1000, h: 700, usableH: 640 };
    const { result } = renderHook(() => useMenuContext());
    result.current.ctx.cascadeArrange();
    expect(h.actions.cascadeArrange).toHaveBeenCalledWith({ w: 1000, h: 640 });
  });

  it("closeAll calls the store action", () => {
    const { result } = renderHook(() => useMenuContext());
    result.current.ctx.closeAll();
    expect(h.actions.closeAll).toHaveBeenCalledTimes(1);
  });

  it("exitDesktop calls setDesktopMode(false)", () => {
    const { result } = renderHook(() => useMenuContext());
    result.current.ctx.exitDesktop();
    expect(h.setDesktopMode).toHaveBeenCalledWith(false);
  });

  it("askMoudir opens the moudir-chat app and dispatches a moudir:ask event carrying the prompt", () => {
    const spy = vi.spyOn(window, "dispatchEvent");
    const { result } = renderHook(() => useMenuContext());
    result.current.ctx.askMoudir("Résume le rapport");
    expect(h.actions.openApp).toHaveBeenCalledWith(
      "moudir-chat",
      expect.objectContaining({ props: { initialPrompt: "Résume le rapport" } }),
    );
    const ev = spy.mock.calls.map((c) => c[0] as CustomEvent).find((e) => e.type === "moudir:ask");
    expect(ev?.detail).toEqual({ prompt: "Résume le rapport" });
    spy.mockRestore();
  });
});

// ─── Appearance ───────────────────────────────────────────────────────────────

describe("useMenuContext — appearance", () => {
  it("exposes theme from useAppTheme and forwards setTheme calls", () => {
    h.theme = "dark";
    const { result } = renderHook(() => useMenuContext());
    expect(result.current.ctx.theme).toBe("dark");
    result.current.ctx.setTheme("light");
    expect(h.setTheme).toHaveBeenCalledWith("light");
  });

  it("exposes wallpaper from the store and forwards setWallpaper to the store action", () => {
    h.wallpaper = "paper";
    const { result } = renderHook(() => useMenuContext());
    expect(result.current.ctx.wallpaper).toBe("paper");
    result.current.ctx.setWallpaper("dawn");
    expect(h.actions.setWallpaper).toHaveBeenCalledWith("dawn");
  });

  it("exposes glassPalette from the store and forwards setGlassPalette to the store action", () => {
    h.glassPalette = "amber";
    const { result } = renderHook(() => useMenuContext());
    expect(result.current.ctx.glassPalette).toBe("amber");
    result.current.ctx.setGlassPalette("sand");
    expect(h.actions.setGlassPalette).toHaveBeenCalledWith("sand");
  });
});

// ─── App command bus wiring ───────────────────────────────────────────────────

describe("useMenuContext — command()", () => {
  it("dispatches an app-command event carrying appId/windowId/commandId/payload", () => {
    h.windows = [makeWindow({ id: "win-1", appId: "telecom", z: 1 })];
    const spy = vi.spyOn(window, "dispatchEvent");
    const { result } = renderHook(() => useMenuContext());
    result.current.ctx.command("export", { format: "csv" });
    const ev = spy.mock.calls.at(-1)?.[0] as CustomEvent;
    expect(ev.type).toBe("desktop:app-command");
    expect(ev.detail).toEqual({
      appId: "telecom",
      windowId: "win-1",
      commandId: "export",
      payload: { format: "csv" },
    });
    spy.mockRestore();
  });

  it("dispatches with an empty-string appId when no app is focused", () => {
    const spy = vi.spyOn(window, "dispatchEvent");
    const { result } = renderHook(() => useMenuContext());
    result.current.ctx.command("refresh");
    const ev = spy.mock.calls.at(-1)?.[0] as CustomEvent;
    expect(ev.detail).toEqual({
      appId: "",
      windowId: null,
      commandId: "refresh",
      payload: undefined,
    });
    spy.mockRestore();
  });
});

// ─── setActivePage() + pages/activePageId ────────────────────────────────────

describe("useMenuContext — setActivePage() and pages", () => {
  it("is a no-op when no window is focused: no store update, no dispatch", () => {
    const spy = vi.spyOn(window, "dispatchEvent");
    const { result } = renderHook(() => useMenuContext());
    result.current.ctx.setActivePage("channels");
    expect(usePageStore.getState().byWindow).toEqual({});
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("updates the page store's active id and dispatches a 'navigate' command when a window is focused", () => {
    h.windows = [makeWindow({ id: "win-1", appId: "telecom", z: 1 })];
    usePageStore.getState().registerPages("win-1", [
      { id: "overview", label: "Vue d'ensemble" },
      { id: "channels", label: "Canaux" },
    ]);
    const spy = vi.spyOn(window, "dispatchEvent");
    const { result } = renderHook(() => useMenuContext());

    act(() => {
      result.current.ctx.setActivePage("channels");
    });

    expect(usePageStore.getState().byWindow["win-1"].activeId).toBe("channels");
    const ev = spy.mock.calls
      .map((c) => c[0] as CustomEvent)
      .find((e) => e.type === "desktop:app-command");
    expect(ev?.detail).toEqual({
      appId: "telecom",
      windowId: "win-1",
      commandId: "navigate",
      payload: { pageId: "channels" },
    });
    spy.mockRestore();
  });

  it("ctx.pages / ctx.activePageId reflect the focused window's registered pages", () => {
    h.windows = [makeWindow({ id: "win-1", appId: "telecom", z: 1 })];
    usePageStore.getState().registerPages(
      "win-1",
      [
        { id: "overview", label: "Vue d'ensemble" },
        { id: "channels", label: "Canaux" },
      ],
      "channels",
    );

    const { result } = renderHook(() => useMenuContext());

    expect(result.current.ctx.pages).toEqual([
      { id: "overview", label: "Vue d'ensemble" },
      { id: "channels", label: "Canaux" },
    ]);
    expect(result.current.ctx.activePageId).toBe("channels");
  });

  it("ctx.pages is empty and activePageId is null when the focused window registered no pages", () => {
    h.windows = [makeWindow({ id: "win-1", appId: "telecom", z: 1 })];
    const { result } = renderHook(() => useMenuContext());
    expect(result.current.ctx.pages).toEqual([]);
    expect(result.current.ctx.activePageId).toBeNull();
  });
});

// ─── groups: ties back into getAppMenuGroups ─────────────────────────────────

describe("useMenuContext — groups", () => {
  it("groups matches getAppMenuGroups(ctx) structurally for the desktop (no focused window) case", () => {
    const { result } = renderHook(() => useMenuContext());
    expect(fingerprint(result.current.groups)).toEqual(
      fingerprint(getAppMenuGroups(result.current.ctx)),
    );
    expect(result.current.groups[0].id).toBe("app");
    expect(result.current.groups[0].label).toBe("Bureau");
  });

  it("groups matches getAppMenuGroups(ctx) structurally for a focused, registered app", () => {
    h.windows = [makeWindow({ id: "win-1", appId: "help", title: "Aide", z: 1 })];
    const { result } = renderHook(() => useMenuContext());
    expect(fingerprint(result.current.groups)).toEqual(
      fingerprint(getAppMenuGroups(result.current.ctx)),
    );
    expect(result.current.groups[0].label).toBe("Aide");
  });
});
