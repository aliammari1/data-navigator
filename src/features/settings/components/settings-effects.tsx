"use client";

/**
 * Settings effects applier.
 *
 * The settings store persists appearance preferences (`theme`, `accentColor`,
 * `density`) but historically *nothing read them*, so the Appearance tab was
 * pure theater. This component is the missing bridge: it turns persisted
 * settings into real, visible app behaviour without touching shared globals.css.
 *
 *  - `theme`: bridged into the app's `ThemeProvider` (`useTheme`), which is the
 *    real source of truth that adds the `light`/`dark` class. Previously the
 *    Settings theme toggle only wrote the store and did nothing visible.
 *  - `accentColor`: overrides the live `--primary` / `--ring` / `--sidebar-primary`
 *    CSS custom properties on `:root`, so buttons, focus rings and accents across
 *    the whole app recolour instantly. It also sets `data-accent` for any
 *    descendant CSS that wants to hook in.
 *  - `density`: scales the global `--radius` and exposes a `--dn-space` token +
 *    `data-density` attribute consumers can read.
 *
 * It self-mounts from the Settings screen, and is also safe to mount once high in
 * the tree. All writes are scoped to `documentElement.style` so they layer
 * cleanly on top of the theme-driven base values and revert on reset.
 */

import { useEffect, useRef } from "react";
import { useShallow } from "zustand/shallow";
import { useTheme } from "@/components/theme-provider";
import { useSettingsStore } from "@/core/stores/settings-store";
import type { AccentColor, DensityMode } from "@/core/stores/settings-store";
import { applySettings } from "@/platform/storage";

/**
 * Accent → oklch overrides. Light/dark variants keep contrast reasonable against
 * the two base themes. Values are chosen to match the existing Tailwind accent
 * naming used in the picker (indigo/violet/cyan/emerald/amber/rose).
 */
const ACCENT_OKLCH: Record<
  AccentColor,
  { primary: { light: string; dark: string }; ring: { light: string; dark: string } }
> = {
  blue: {
    primary: { light: "oklch(0.575 0.214 266)", dark: "oklch(0.675 0.16 266)" },
    ring: { light: "oklch(0.6 0.2 266)", dark: "oklch(0.7 0.15 266)" },
  },
  indigo: {
    primary: { light: "oklch(0.52 0.18 277)", dark: "oklch(0.7 0.16 277)" },
    ring: { light: "oklch(0.6 0.17 277)", dark: "oklch(0.72 0.15 277)" },
  },
  violet: {
    primary: { light: "oklch(0.52 0.2 300)", dark: "oklch(0.71 0.17 300)" },
    ring: { light: "oklch(0.6 0.19 300)", dark: "oklch(0.73 0.16 300)" },
  },
  cyan: {
    // Aligned to the theme's Signal-Cyan --primary so the default accent matches
    // the base tokens exactly (deeper on light, brighter on dark).
    primary: { light: "oklch(0.52 0.105 223)", dark: "oklch(0.8 0.14 205)" },
    ring: { light: "oklch(0.609 0.126 222)", dark: "oklch(0.75 0.13 206)" },
  },
  emerald: {
    primary: { light: "oklch(0.55 0.13 163)", dark: "oklch(0.76 0.16 163)" },
    ring: { light: "oklch(0.6 0.14 163)", dark: "oklch(0.74 0.15 163)" },
  },
  amber: {
    primary: { light: "oklch(0.66 0.16 66)", dark: "oklch(0.83 0.13 66)" },
    ring: { light: "oklch(0.7 0.16 66)", dark: "oklch(0.8 0.14 66)" },
  },
  rose: {
    primary: { light: "oklch(0.58 0.21 16)", dark: "oklch(0.72 0.19 16)" },
    ring: { light: "oklch(0.63 0.2 16)", dark: "oklch(0.74 0.18 16)" },
  },
};

const DENSITY_TOKENS: Record<DensityMode, { radius: string; space: string }> = {
  compact: { radius: "0.5rem", space: "0.5rem" },
  comfortable: { radius: "0.75rem", space: "0.875rem" },
  spacious: { radius: "1rem", space: "1.25rem" },
};

export function SettingsEffects() {
  const { theme, accentColor, density, animationsEnabled, compactNumbers, performance } =
    useSettingsStore(
      useShallow((s) => ({
        theme: s.theme,
        accentColor: s.accentColor,
        density: s.density,
        animationsEnabled: s.animationsEnabled,
        compactNumbers: s.compactNumbers,
        performance: s.performance,
      })),
    );
  const storeSetTheme = useSettingsStore((s) => s.setTheme);
  const { setTheme, resolvedTheme } = useTheme();

  // Track whether the initial-mount reconciliation has run.
  const themeInitDone = useRef(false);

  // 1. Theme: settings store ↔ ThemeProvider bidirectional sync.
  //
  //    Problem solved here: ThemeProvider and the settings store use SEPARATE
  //    localStorage keys ("theme" vs "data-navigator-settings"). Any time
  //    ThemeProvider.setTheme is called outside the settings page — e.g. the
  //    login screen toggle or the topbar cycle button — only ThemeProvider's key
  //    gets updated. On the next session the settings store still has the old
  //    value and this effect would overwrite the user's preference.
  //
  //    Fix: on the very first mount, read ThemeProvider's own localStorage key.
  //    If it disagrees with the settings store, update the settings store first
  //    so the subsequent setTheme call is a no-op rather than a clobber.
  useEffect(() => {
    if (!themeInitDone.current) {
      themeInitDone.current = true;
      const providerStored = localStorage.getItem("theme") as "light" | "dark" | "system" | null;
      if (
        (providerStored === "light" || providerStored === "dark" || providerStored === "system") &&
        providerStored !== theme
      ) {
        // ThemeProvider's key is more recent (e.g. set from login screen or topbar).
        // Update the settings store to match so the push below is a no-op.
        storeSetTheme(providerStored);
        return; // re-runs when theme (store) updates to the new value
      }
    }
    setTheme(theme);
  }, [theme, setTheme, storeSetTheme]);

  // 1b. Bridge to the canonical platform applier so accent/density/animations
  //     flow through the documented `--accent` / `--density-scale` /
  //     `--motion-allowed` / `data-*` tokens, AND the clamped performance config
  //     is published to the runtime singleton the DuckDB pool + TanStack Virtual
  //     read (`getRuntimePerformanceConfig`/`subscribePerformanceConfig`). This
  //     makes the Performance tab real instead of write-only.
  useEffect(() => {
    applySettings({
      appearance: { theme, accentColor, density, animationsEnabled, compactNumbers },
      performance: {
        duckdbWorkers: performance.duckdbWorkers,
        maxMemoryMB: performance.maxMemoryMB,
        virtualizeThreshold: performance.virtualizeThreshold,
        cacheQueries: performance.cacheQueries,
        enableWASMStreaming: performance.enableWASMStreaming,
      },
    });
  }, [
    theme,
    accentColor,
    density,
    animationsEnabled,
    compactNumbers,
    performance.duckdbWorkers,
    performance.maxMemoryMB,
    performance.virtualizeThreshold,
    performance.cacheQueries,
    performance.enableWASMStreaming,
  ]);

  // 2. Accent: override live CSS custom properties for the resolved theme.
  useEffect(() => {
    const root = document.documentElement;
    const variant = resolvedTheme === "light" ? "light" : "dark";
    const accent = ACCENT_OKLCH[accentColor] ?? ACCENT_OKLCH.blue;
    root.style.setProperty("--primary", accent.primary[variant]);
    root.style.setProperty("--ring", accent.ring[variant]);
    root.style.setProperty("--sidebar-primary", accent.primary[variant]);
    root.style.setProperty("--sidebar-ring", accent.ring[variant]);
    root.dataset.accent = accentColor;
  }, [accentColor, resolvedTheme]);

  // 3. Density: scale radius + expose a spacing token + data attribute.
  useEffect(() => {
    const root = document.documentElement;
    const tokens = DENSITY_TOKENS[density] ?? DENSITY_TOKENS.comfortable;
    root.style.setProperty("--radius", tokens.radius);
    root.style.setProperty("--dn-space", tokens.space);
    root.dataset.density = density;
  }, [density]);

  // No unmount cleanup: SettingsEffects is now mounted once globally
  // (DashboardClientShell). Stripping the managed overrides on unmount would
  // only cause a first-paint flash; defaults are restored through the store.

  return null;
}
