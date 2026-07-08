/**
 * Data Navigator motion system — the only sanctioned motions.
 *
 * Doctrine ("Cockpit & Cinéma"): working screens get restrained micro-motion,
 * cinema surfaces (landing, Accueil hero, Theater) get scroll depth. Every
 * primitive here animates ONLY transform / opacity / clip-path so it stays on
 * the compositor and never competes with CSV/report work on the main thread.
 *
 * Durations come from the CSS motion tokens (globals.css):
 *   --dur-micro 120ms · --dur-enter 180ms · --dur-overlay 240ms
 *   --ease-out-quart cubic-bezier(0.25, 1, 0.5, 1)
 */
import type { Transition, Variants } from "motion/react";

export const DUR = {
  micro: 0.12,
  enter: 0.18,
  overlay: 0.24,
} as const;

export const EASE_OUT_QUART = [0.25, 1, 0.5, 1] as const;

export const springPress: Transition = {
  type: "spring",
  stiffness: 500,
  damping: 30,
};

export const drawerSpring: Transition = {
  type: "spring",
  stiffness: 320,
  damping: 34,
};

/** opacity 0→1 + translateY 10px→0 — panels, cards, modal content, route mount */
export const enterRise: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DUR.enter, ease: EASE_OUT_QUART },
  },
};

/**
 * Staggered children entrance, 40ms increments, capped at 6 so a long grid
 * never trickles in. Use on a parent with `enterRise` children.
 */
export const staggerGrid: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.04, staggerDirection: 1 },
  },
};

export const STAGGER_CAP = 6;

/** Press feedback for buttons / launcher cards / nav items. */
export const pressProps = {
  whileTap: { scale: 0.98 },
  transition: springPress,
} as const;

/** Reduced-motion variants — instant, no transform. */
export const reducedRise: Variants = {
  hidden: { opacity: 1, y: 0 },
  visible: { opacity: 1, y: 0 },
};

/** Pick entrance variants honoring the user's motion preference. */
export function riseVariants(reduced: boolean): Variants {
  return reduced ? reducedRise : enterRise;
}
