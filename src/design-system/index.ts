/**
 * Data Navigator design system v2 — shared primitives every screen must use.
 * Import from "@/design-system" rather than reaching for per-feature variants.
 */
export { EmptyState } from "./empty-state";
export { KpiStat } from "./kpi-stat";
export {
  DUR,
  drawerSpring,
  EASE_OUT_QUART,
  enterRise,
  pressProps,
  riseVariants,
  STAGGER_CAP,
  springPress,
  staggerGrid,
} from "./motion";
export { Rise, StaggerGrid, StaggerItem } from "./motion-components";
export { type NextStep, NextSteps } from "./next-steps";
export { PageHeader } from "./page-header";
export { useMotionPrefs } from "./use-motion-prefs";
export { useSpotlight } from "./use-spotlight";
