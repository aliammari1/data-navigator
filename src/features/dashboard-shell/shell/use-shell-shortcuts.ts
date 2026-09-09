"use client";

import { useEffect } from "react";
import { tinykeys } from "tinykeys";

export interface ShellShortcutActions {
  togglePalette: () => void;
  toggleSidebar: () => void;
  lockApp?: () => void;
}

/**
 * Centralised shell keybindings via `tinykeys` (~650B).
 *
 * Replaces separate `window.addEventListener("keydown")` effects (Cmd+K in
 * the Topbar, Cmd+B in DashboardLayout) with one declarative map. `$mod`
 * resolves to Cmd on macOS / Ctrl elsewhere automatically. Always returns
 * the unsubscribe so listeners are not leaked across HMR / navigation.
 */
export function useShellShortcuts(actions: ShellShortcutActions): void {
  useEffect(() => {
    return tinykeys(window, {
      "$mod+k": (event) => {
        event.preventDefault();
        actions.togglePalette();
      },
      "$mod+b": (event) => {
        event.preventDefault();
        actions.toggleSidebar();
      },
      "$mod+l": (event) => {
        event.preventDefault();
        actions.lockApp?.();
      },
    });
  }, [actions]);
}
