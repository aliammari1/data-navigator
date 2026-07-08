"use client";

/**
 * Translucent preview of the rect a dragged window will snap into.
 *
 * Purely presentational: given a resolved snap `zone` and the `viewport`, it
 * draws a glass-accent ghost over the target rect (computed via
 * {@link computeSnapZones}). When `zone` is `null` it renders nothing. The
 * window frame mounts this while a snap-eligible drag is in progress.
 */

import { AnimatePresence, motion } from "motion/react";

import { computeSnapZones, type SnapViewport, type SnapZoneName } from "../core/snap";

export interface SnapOverlayProps {
  /** Resolved zone, or `null` to hide the preview. */
  zone: SnapZoneName | null;
  /** Viewport the zone rects are computed against. */
  viewport: SnapViewport;
}

/**
 * Accent-tinted ghost of the snap target. Sits at the drawer z-band so it
 * floats above the canvas but below modal chrome. Non-interactive.
 */
export function SnapOverlay({ zone, viewport }: SnapOverlayProps) {
  const rect = zone ? computeSnapZones(viewport)[zone] : null;

  return (
    <AnimatePresence>
      {rect ? (
        <motion.div
          key={zone}
          aria-hidden
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.985 }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none fixed z-[var(--z-drawer)] rounded-2xl"
          style={{
            left: rect.x + 8,
            top: rect.y + 8,
            width: Math.max(0, rect.w - 16),
            height: Math.max(0, rect.h - 16),
            background: "hsl(var(--glass-accent) / 0.16)",
            border: "2px solid hsl(var(--glass-accent) / 0.5)",
            boxShadow:
              "0 8px 40px hsl(var(--glass-accent) / 0.22), inset 0 1px 0 var(--glass-hairline)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
        />
      ) : null}
    </AnimatePresence>
  );
}
