"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { enterRise, riseVariants, staggerGrid } from "./motion";
import { useMotionPrefs } from "./use-motion-prefs";

/**
 * <Rise> — drop-in entrance wrapper (opacity + translateY). Honors reduced
 * motion automatically. Use for panels, cards, and route-level content mounts.
 */
export function Rise({ children, ...props }: HTMLMotionProps<"div">) {
  const { reduced } = useMotionPrefs();
  return (
    <motion.div initial="hidden" animate="visible" variants={riseVariants(reduced)} {...props}>
      {children}
    </motion.div>
  );
}

/**
 * <StaggerGrid> — parent that staggers `enterRise` children (40ms, capped 6).
 * Pair with <StaggerItem> children. Reduced motion → instant, no stagger.
 */
export function StaggerGrid({ children, ...props }: HTMLMotionProps<"div">) {
  const { reduced } = useMotionPrefs();
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={reduced ? undefined : staggerGrid}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, ...props }: HTMLMotionProps<"div">) {
  const { reduced } = useMotionPrefs();
  return (
    <motion.div variants={reduced ? undefined : enterRise} {...props}>
      {children}
    </motion.div>
  );
}
