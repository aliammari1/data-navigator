"use client";

import { useCallback } from "react";
import { useTheme } from "@/components/theme-provider";
import { useSettingsStore } from "@/core/stores/settings-store";

type AppTheme = "light" | "dark" | "system";

/**
 * Drop-in replacement for `useTheme()` for any UI control that changes the
 * theme (topbar, command palette, menubar, taskbar, login screen).
 *
 * Why this exists: ThemeProvider and the settings store use separate
 * localStorage keys. Calling ThemeProvider.setTheme directly (via useTheme)
 * skips the settings store, so the Appearance panel shows a stale value and
 * the cross-session reconciliation in SettingsEffects has to guess the intent.
 *
 * This hook writes to BOTH atomically:
 *   1. ThemeProvider → immediate DOM class change (dark/light on <html>)
 *   2. Settings store → Appearance panel stays accurate; Zustand persist keeps
 *      "data-navigator-settings" in sync for next session
 */
export function useAppTheme() {
  const { theme, resolvedTheme, systemTheme, themes, setTheme: setProviderTheme } = useTheme();
  const setStoreTheme = useSettingsStore((s) => s.setTheme);

  const setTheme = useCallback(
    (value: AppTheme) => {
      setProviderTheme(value);
      setStoreTheme(value);
    },
    [setProviderTheme, setStoreTheme],
  );

  return { theme, resolvedTheme, systemTheme, themes, setTheme };
}
