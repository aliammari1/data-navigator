"use client";

import { useEffect } from "react";
import { tinykeys } from "tinykeys";

export interface ShellShortcutActions {
  togglePalette: () => void;
  toggleAi: () => void;
  toggleSidebar: () => void;
}

/**
 * Centralised shell keybindings via `tinykeys` (~650B).
 *
 * Replaces three separate `window.addEventListener("keydown")` effects (Cmd+K in
 * the Topbar, Cmd+\\ + Cmd+B in DashboardLayout) with one declarative map.
 * `$mod` resolves to Cmd on macOS / Ctrl elsewhere automatically. Always returns
 * the unsubscribe so listeners are not leaked across HMR / navigation.
 */
export function useShellShortcuts(actions: ShellShortcutActions): void {
  useEffect(() => {
    return tinykeys(window, {
      "$mod+k": (event) => {
        event.preventDefault();
        actions.togglePalette();
      },
      "$mod+Backslash": (event) => {
        event.preventDefault();
        actions.toggleAi();
      },
      "$mod+b": (event) => {
        event.preventDefault();
        actions.toggleSidebar();
      },
    });
  }, [actions]);
}
