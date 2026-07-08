/**
 * Shared chart theme constants for the Analytics Theater scenes.
 *
 * Kept in one module so every scene renders with a consistent dark palette and
 * the constants are not re-declared per scene module.
 */

export const TOOLTIP_BG = "#1e1e2e";
export const TOOLTIP_BORDER = "#ffffff10";
export const TEXT_COLOR = "#94a3b8";
export const AXIS_LINE = { lineStyle: { color: "#ffffff10" } } as const;
export const SPLIT_LINE_STYLE = { lineStyle: { color: "#ffffff08" } } as const;

/** Stable categorical palette reused across scenes (race, sankey, sunburst). */
export const SERIES_COLORS = [
  "#06b6d4",
  "#8b5cf6",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#3b82f6",
  "#ec4899",
  "#84cc16",
  "#f97316",
  "#a78bfa",
  "#22c55e",
  "#eab308",
] as const;

export function seriesColor(index: number): string {
  return SERIES_COLORS[
    ((index % SERIES_COLORS.length) + SERIES_COLORS.length) % SERIES_COLORS.length
  ];
}
