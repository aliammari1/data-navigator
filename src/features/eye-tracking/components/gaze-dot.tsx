"use client";

import { useEffect, useRef, useState } from "react";
import { eyeTracker } from "../core/eyetracker";

/**
 * Translucent dot that follows live gaze.
 *
 * Subscribes directly to `eyeTracker.onGaze` (not the zustand store) so it can
 * update at the prediction frame-rate without triggering a store-wide re-render
 * cascade. Position is written via a ref + transform to stay cheap. The dot is
 * `pointer-events: none` and pinned to a high z-index so it never intercepts
 * clicks on the underlying UI.
 *
 * Mounted globally by the screen through a portal to `document.body`, gated on
 * the `showGazeDot` preference, so it overlays the entire desktop.
 */
export function GazeDot() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  // Light smoothing: exponential moving average to reduce jitter.
  const smoothed = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const ALPHA = 0.35;
    const unsubscribe = eyeTracker.onGaze((x, y) => {
      const prev = smoothed.current;
      const sx = prev ? prev.x + (x - prev.x) * ALPHA : x;
      const sy = prev ? prev.y + (y - prev.y) * ALPHA : y;
      smoothed.current = { x: sx, y: sy };

      const node = ref.current;
      if (node) {
        node.style.transform = `translate3d(${sx}px, ${sy}px, 0) translate(-50%, -50%)`;
      }
      if (!visible) setVisible(true);
    });
    return () => {
      unsubscribe();
      smoothed.current = null;
    };
  }, [visible]);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-[9990] h-9 w-9 rounded-full"
      style={{
        opacity: visible ? 1 : 0,
        background:
          "radial-gradient(circle, color-mix(in oklab, var(--color-primary) 55%, transparent) 0%, color-mix(in oklab, var(--color-primary) 18%, transparent) 60%, transparent 75%)",
        boxShadow: "0 0 0 1px color-mix(in oklab, var(--color-primary) 30%, transparent)",
        transition: "opacity 200ms ease",
        willChange: "transform",
      }}
    />
  );
}
