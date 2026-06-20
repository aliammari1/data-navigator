"use client";

/**
 * Thin local hook around `scrollama` (IntersectionObserver-based scrollytelling).
 *
 * We wrap the upstream library directly rather than the inactive
 * `react-scrollama`. Steps are any descendant elements carrying `[data-scene]`;
 * `onStep` fires when one enters the active band. Callbacks are read through a
 * ref so they can change without tearing down the observer.
 */

import { useEffect, useRef } from "react";
import scrollama from "scrollama";

export function useScrollama(
  onStep: (index: number, direction: "up" | "down") => void,
  options?: { enabled?: boolean; offset?: 0.1 | 0.2 | 0.3 | 0.4 | 0.5 | 0.6 },
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;

  const enabled = options?.enabled ?? true;
  const offset = options?.offset ?? 0.5;

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled) return;

    const steps = root.querySelectorAll<HTMLElement>("[data-scene]");
    if (steps.length === 0) return;

    const sc = scrollama();
    sc.setup({ step: steps, offset, progress: false }).onStepEnter(({ index, direction }) =>
      onStepRef.current(index, direction),
    );

    const onResize = () => sc.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      sc.destroy();
    };
    // Re-run only when enable/offset changes; step elements are queried live.
  }, [enabled, offset]);

  return rootRef;
}
