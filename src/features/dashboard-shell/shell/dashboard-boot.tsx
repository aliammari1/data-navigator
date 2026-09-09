"use client";

import { useEffect } from "react";
import { useSettingsStore } from "@/core/stores/settings-store";
import { initWebVitals } from "@/platform/perf/web-vitals";
import { applySettings, ensurePersistentStorage } from "@/platform/storage";

/**
 * Shell-owned boot wire-in (dashboard-shell owns these per FOUNDATION-API.md).
 *
 *  1. `ensurePersistentStorage()` once at startup so the OS will not silently
 *     evict IndexedDB (history, onboarding, query-cache snapshot, achievements)
 *     under storage pressure.
 *  2. `applySettings(...)` whenever the persisted appearance/performance slices
 *     change, turning settings into REAL effects: accent/density/animations →
 *     CSS vars + `data-*` attrs on `<html>` (consumed by the design tokens), and
 *     the clamped runtime performance config the DuckDB pool / virtualization
 *     read. Subscribes to narrow selectors so it only re-applies on real change.
 *
 * Renders nothing — it is a side-effect boundary mounted once in the dashboard
 * layout.
 */
export function DashboardBoot() {
  // Pin storage once.
  useEffect(() => {
    void ensurePersistentStorage();
  }, []);

  // Offline perf instrumentation, once (architecture.md §13). Web-Vitals RUM
  // logs CLS/LCP/INP to IndexedDB with NO network endpoint; react-scan is a
  // dev-only re-render profiler that self-guards against production and is
  // dead-code-eliminated from packaged builds.
  useEffect(() => {
    initWebVitals();
  }, []);

  const theme = useSettingsStore((s) => s.theme);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const density = useSettingsStore((s) => s.density);
  const animationsEnabled = useSettingsStore((s) => s.animationsEnabled);
  const compactNumbers = useSettingsStore((s) => s.compactNumbers);
  const performance = useSettingsStore((s) => s.performance);

  useEffect(() => {
    applySettings({
      appearance: { theme, accentColor, density, animationsEnabled, compactNumbers },
      performance,
    });
  }, [theme, accentColor, density, animationsEnabled, compactNumbers, performance]);

  return null;
}
