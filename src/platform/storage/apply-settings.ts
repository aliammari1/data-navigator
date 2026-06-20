/**
 * Settings application helper (architecture §4: "Settings must actually be
 * applied").
 *
 * Today several settings are write-only theatre: accent/density/animations are
 * stored but never injected as CSS vars/data-attrs, and the performance knobs
 * (duckdbWorkers / maxMemoryMB / virtualizeThreshold) are never read by the
 * DuckDB pool or the virtualization layer. This module turns persisted settings
 * into REAL effects:
 *
 *   - appearance  → `data-*` attributes + CSS custom properties on
 *     `<html>` (consumed by the existing token CSS),
 *   - performance → a typed, clamped `RuntimePerformanceConfig` object the
 *     DuckDB pool / TanStack Virtual read (single source of truth),
 * with every numeric value coerced + clamped through the feature's
 * `settings-schema` (so `NaN`/out-of-range can never reach DuckDB or the grid).
 *
 * Theme itself stays owned by `theme-provider` (light/dark/system + colorScheme)
 * to avoid the theme double-source drift — this helper only mirrors the chosen
 * theme value into a `data-theme` attribute for non-class consumers and records
 * drift, it does not fight the provider over the `class`/`colorScheme`.
 *
 * Zero network, no assets — pure DOM + in-memory config.
 */

import {
  type AccentColorValue,
  AccentColorSchema,
  clampNumericSetting,
  type DensityModeValue,
  DensityModeSchema,
  type ThemeValue,
  ThemeSchema,
} from "@/features/settings/lib/settings-schema";

// ─── Input shape (structurally matches the settings store; not imported to
// avoid coupling the platform layer to a core store) ──────────────────────────

export interface AppearanceInput {
  theme?: string;
  accentColor?: string;
  density?: string;
  animationsEnabled?: boolean;
  compactNumbers?: boolean;
}

export interface PerformanceInput {
  duckdbWorkers?: number | string;
  maxMemoryMB?: number | string;
  virtualizeThreshold?: number | string;
  cacheQueries?: boolean;
  enableWASMStreaming?: boolean;
}

// ─── Accent color tokens (single source of truth) ─────────────────────────────
//
// Maps the accent enum to its base HSL/HEX so the value can drive a CSS custom
// property. Kept here next to the applier; the design-token CSS reads
// `--user-accent` (NOT `--accent` — that name is the shadcn neutral hover-surface
// token, so writing the brand hex to it would recolour every bg-accent surface).
// Values mirror the Tailwind palette already used in the app.

const ACCENT_HEX: Record<AccentColorValue, string> = {
  blue: "#2f6bff",
  indigo: "#6366f1",
  violet: "#8b5cf6",
  cyan: "#06b6d4",
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#f43f5e",
};

const DENSITY_SPACING: Record<DensityModeValue, string> = {
  compact: "0.75",
  comfortable: "1",
  spacious: "1.25",
};

function root(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.documentElement;
}

// ─── Appearance → DOM ─────────────────────────────────────────────────────────

/**
 * Apply appearance settings as data-attributes + CSS variables on `<html>`.
 * Coerces enums through Zod (falls back to defaults on bad values). Returns the
 * resolved values actually applied (for drift detection / debugging).
 */
export function applyAppearance(input: AppearanceInput): {
  accentColor: AccentColorValue;
  density: DensityModeValue;
  theme: ThemeValue;
  animationsEnabled: boolean;
} {
  const accentColor: AccentColorValue =
    AccentColorSchema.safeParse(input.accentColor).data ?? "blue";
  const density: DensityModeValue =
    DensityModeSchema.safeParse(input.density).data ?? "comfortable";
  const theme: ThemeValue = ThemeSchema.safeParse(input.theme).data ?? "system";
  const animationsEnabled = input.animationsEnabled !== false;

  const el = root();
  if (el) {
    el.setAttribute("data-accent", accentColor);
    el.setAttribute("data-density", density);
    // Mirror theme for non-class CSS consumers; do NOT touch `class`/colorScheme
    // (theme-provider owns those).
    el.setAttribute("data-theme", theme);
    el.setAttribute("data-animations", animationsEnabled ? "on" : "off");
    el.setAttribute("data-compact-numbers", input.compactNumbers ? "on" : "off");

    const style = el.style;
    style.setProperty("--user-accent", ACCENT_HEX[accentColor]);
    style.setProperty("--density-scale", DENSITY_SPACING[density]);
    // A single switch the motion CSS / framer config can read.
    style.setProperty("--motion-allowed", animationsEnabled ? "1" : "0");
  }

  return { accentColor, density, theme, animationsEnabled };
}

// ─── Performance → runtime config (the real effect surface) ───────────────────

export interface RuntimePerformanceConfig {
  /** Clamped 1..8 — read by the DuckDB worker pool. */
  duckdbWorkers: number;
  /** Clamped 256..4096 MB — read by the DuckDB memory limit. */
  maxMemoryMB: number;
  /** Clamped 50..5000 — read by TanStack Virtual gating. */
  virtualizeThreshold: number;
  cacheQueries: boolean;
  enableWASMStreaming: boolean;
}

/**
 * Coerce + clamp performance settings into the typed runtime config that the
 * DuckDB pool and virtualization layer consume. All numerics go through
 * `clampNumericSetting`, so an out-of-range/`NaN` draft becomes the safe field
 * default instead of poisoning the engine.
 */
export function resolvePerformanceConfig(input: PerformanceInput): RuntimePerformanceConfig {
  return {
    duckdbWorkers: clampNumericSetting("duckdbWorkers", input.duckdbWorkers ?? 4),
    maxMemoryMB: clampNumericSetting("maxMemoryMB", input.maxMemoryMB ?? 512),
    virtualizeThreshold: clampNumericSetting(
      "virtualizeThreshold",
      input.virtualizeThreshold ?? 500,
    ),
    cacheQueries: input.cacheQueries !== false,
    enableWASMStreaming: input.enableWASMStreaming !== false,
  };
}

// ─── Live runtime config singleton (so non-React consumers — the DuckDB pool,
// worker bootstrap — can read the current effective perf config) ──────────────

let currentPerf: RuntimePerformanceConfig = resolvePerformanceConfig({});
const perfListeners = new Set<(c: RuntimePerformanceConfig) => void>();

/** Read the current effective performance config (e.g. from worker bootstrap). */
export function getRuntimePerformanceConfig(): RuntimePerformanceConfig {
  return currentPerf;
}

/** Subscribe to performance-config changes; returns an unsubscribe. */
export function subscribePerformanceConfig(
  listener: (config: RuntimePerformanceConfig) => void,
): () => void {
  perfListeners.add(listener);
  return () => perfListeners.delete(listener);
}

function setPerf(next: RuntimePerformanceConfig): void {
  currentPerf = next;
  for (const listener of perfListeners) listener(next);
}

// ─── Combined applier (the one call a provider effect makes) ──────────────────

export interface AppliedSettings {
  appearance: ReturnType<typeof applyAppearance>;
  performance: RuntimePerformanceConfig;
}

/**
 * Apply BOTH appearance and performance from a settings snapshot. Call from the
 * settings provider effect on mount and whenever the relevant slices change
 * (subscribe to narrow selectors so this only runs on real changes). The
 * performance config is published to the runtime singleton so the DuckDB pool /
 * virtualization layer pick it up without prop-drilling.
 */
export function applySettings(input: {
  appearance: AppearanceInput;
  performance: PerformanceInput;
}): AppliedSettings {
  const appearance = applyAppearance(input.appearance);
  const performance = resolvePerformanceConfig(input.performance);
  setPerf(performance);
  return { appearance, performance };
}
