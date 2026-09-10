"use client";

import { useMemo } from "react";
import { useShellActions } from "@/features/dashboard-shell/shell/shell-store";
import { captureSnapshot } from "@/features/desktop/components/snapshots-layer";
import { getApp } from "@/features/desktop/core/app-registry";
import { getDesktopCanvas } from "@/features/desktop/core/layout";
import {
  dispatchAppCommand,
  usePageStore,
  useWindowPages,
} from "@/features/desktop/core/menu/app-commands";
import { getAppMenuGroups } from "@/features/desktop/core/menu/menu-composer";
import type { MenuContext, MenuGroup } from "@/features/desktop/core/menu/types";
import {
  useDesktopActions,
  useDesktopWindows,
  useGlassPalette,
  usePinnedOnTop,
  useWallpaper,
} from "@/features/desktop/store/desktop-store";
import { useAppTheme } from "@/hooks/use-app-theme";

/** The focused (top-most, non-minimised, pin-aware) window, or null. */
function useFocusedWindow() {
  const windows = useDesktopWindows();
  const pinned = usePinnedOnTop();
  return useMemo(() => {
    let top: (typeof windows)[number] | null = null;
    let topZ = -1;
    for (const w of windows) {
      if (w.minimized) continue;
      const z = pinned.includes(w.id) ? w.z + 100000 : w.z;
      if (z > topZ) {
        topZ = z;
        top = w;
      }
    }
    return top;
  }, [windows, pinned]);
}

/**
 * Build the live {@link MenuContext} for the focused window and compose the
 * final menu groups for the bar. Returns the desktop ("Bureau") menus when no
 * window is focused. The leading bold label is the focused app's title.
 */
export function useMenuContext(): { ctx: MenuContext; groups: MenuGroup[] } {
  const focused = useFocusedWindow();
  const actions = useDesktopActions();
  const pinned = usePinnedOnTop();
  const wallpaper = useWallpaper();
  const glassPalette = useGlassPalette();
  const { theme, setTheme } = useAppTheme();
  const { setDesktopMode } = useShellActions();

  const windowId = focused?.id ?? null;
  const appId = focused?.appId ?? null;
  const app = appId ? getApp(appId) : undefined;
  const pages = useWindowPages(windowId);

  const ctx = useMemo<MenuContext>(() => {
    const canvas = getDesktopCanvas();
    const usable = { w: canvas.w, h: canvas.usableH };

    const openApp: MenuContext["openApp"] = (id, opts) => {
      actions.openApp(id, opts);
    };

    return {
      appId,
      windowId,
      title: focused?.title ?? app?.title ?? "Bureau",
      hue: app?.hue ?? 28,
      isMaximized: Boolean(focused?.maximized),
      isPinnedOnTop: windowId ? pinned.includes(windowId) : false,
      pages: pages.items,
      activePageId: pages.activeId,

      closeWindow: () => windowId && actions.closeWindow(windowId),
      minimizeWindow: () => windowId && actions.minimizeWindow(windowId),
      toggleMaximize: () => windowId && actions.toggleMaximize(windowId, usable),
      togglePinOnTop: () => windowId && actions.togglePinOnTop(windowId),
      snapshot: () => {
        if (!focused) return;
        captureSnapshot({
          title: focused.title,
          kind: "table",
          appId: focused.appId,
          text: `Instantané — ${focused.title}`,
          w: 300,
          h: 220,
        });
      },

      openApp,
      cascadeArrange: () => actions.cascadeArrange(usable),
      closeAll: () => actions.closeAll(),
      exitDesktop: () => setDesktopMode(false),
      askMoudir: (prompt) => {
        // The Moudir assistant (app "moudir-chat") owns the `moudir:ask`
        // channel; the formulator (app "moudir") listens on its command bus.
        actions.openApp("moudir-chat");
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("moudir:ask", { detail: { prompt } }));
        }
      },

      theme,
      setTheme,
      wallpaper,
      setWallpaper: actions.setWallpaper,
      glassPalette,
      setGlassPalette: actions.setGlassPalette,

      command: (commandId, payload) =>
        dispatchAppCommand(appId ?? "", windowId, commandId, payload),
      setActivePage: (pageId) => {
        if (!windowId) return;
        usePageStore.getState().setActivePage(windowId, pageId);
        dispatchAppCommand(appId ?? "", windowId, "navigate", { pageId });
      },
    };
  }, [
    actions,
    app,
    appId,
    focused,
    glassPalette,
    pages,
    pinned,
    setDesktopMode,
    setTheme,
    theme,
    wallpaper,
    windowId,
  ]);

  const groups = useMemo(() => getAppMenuGroups(ctx), [ctx]);
  return { ctx, groups };
}
