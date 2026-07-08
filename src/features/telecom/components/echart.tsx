"use client";

/**
 * Telecom shared ECharts surface.
 *
 * Routes every telecom chart through the platform foundation:
 *   - Heavy charts render off the main thread via `<OffscreenChart>` (ECharts
 *     core in an OffscreenCanvas worker — see `@/platform/viz`).
 *   - When OffscreenCanvas/Worker is unavailable, it falls back to
 *     `echarts-for-react` fed the SAME tree-shaken `echarts` core (never the
 *     full build), so we keep one registry and a small bundle.
 *
 * This replaces the per-component `import ReactECharts from "echarts-for-react"`
 * (full build, main-thread rasterization) the telecom charts used before.
 *
 * Theme reactivity
 * ----------------
 * The telecom `build*Option` builders resolve theme colors (shadcn CSS tokens)
 * to canvas-safe rgb/rgba strings AT BUILD TIME on the main thread, because the
 * render worker has no DOM and can't read CSS vars. The components that call the
 * builders `useMemo` the option on data-only deps, so flipping light/dark does
 * NOT rebuild it — the chart would keep the previous theme's colors.
 *
 * `<EChart>` closes that gap: it watches `document.documentElement`'s theme class
 * and, on a flip, re-tints the current option (`retintOption`, swapping the old
 * palette for the freshly-resolved one) so the worker re-renders with the active
 * theme. It also bumps a `key` so the OffscreenCanvas re-inits cleanly with the
 * new colors. No new deps; offline-safe.
 */

import ReactECharts from "echarts-for-react/lib/core";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { type ChartTheme, chartTheme, retintOption } from "@/features/telecom/lib/chart-options";
import { type EChartsOption, echarts, OffscreenChart } from "@/platform/viz";

export interface EChartProps {
  /** ECharts option object (the telecom `build*Option` builders return these). */
  option: object;
  height: number;
  className?: string;
  theme?: string;
}

/** The resolved theme class currently applied to <html> ("light" | "dark"). */
function readThemeClass(): string {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

export const EChart = memo(function EChart({ option, height, className, theme }: EChartProps) {
  // `themeClass` re-renders this component whenever the active theme flips.
  const [themeClass, setThemeClass] = useState(readThemeClass);

  // Watch the <html> theme class. The provider toggles `light`/`dark` there
  // (see theme-provider.tsx); a class-only MutationObserver keeps us decoupled
  // from the provider context and works in every host (report grid, exports…).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      const next = readThemeClass();
      setThemeClass((current) => (current === next ? current : next));
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // Baseline palette the current `option` reference was built against. A builder
  // resolves colors at build time, so a fresh `option` is assumed to match the
  // theme active at that moment; we recapture the baseline whenever `option`
  // changes and re-tint from it to the active palette on a theme flip.
  const baselineRef = useRef<{ option: object; theme: ChartTheme } | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `themeClass` is the flip signal — it must stay a dep so the memo re-runs on a theme change, even though the comparison happens through `baselineRef` rather than reading `themeClass` directly.
  const themedOption = useMemo(() => {
    const active = chartTheme();
    const baseline = baselineRef.current;

    // New `option` reference (data-driven rebuild) → it already carries the
    // active theme's colors. Adopt it and its palette as the new baseline.
    if (!baseline || baseline.option !== option) {
      baselineRef.current = { option, theme: active };
      return option;
    }

    // Same `option`, but the theme class flipped → re-tint the stale option
    // from its baseline palette to the active one.
    const retinted = retintOption(option, baseline.theme, active) as object;
    baselineRef.current = { option, theme: active };
    return retinted;
  }, [option, themeClass]);

  const opt = themedOption as EChartsOption;
  return (
    <OffscreenChart
      // Re-init the OffscreenCanvas on a theme flip so the worker picks up the
      // newly-resolved colors cleanly (mirrors the re-tinted option).
      key={themeClass}
      option={opt}
      height={height}
      className={className}
      theme={theme}
      fallback={
        <ReactECharts
          // Feed the tree-shaken core so the fallback shares ONE registry.
          echarts={echarts}
          option={opt}
          style={{ height }}
          className={className}
          opts={{ renderer: "canvas" }}
        />
      }
    />
  );
});
