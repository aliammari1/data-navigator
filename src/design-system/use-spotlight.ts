"use client";

import { useCallback, useRef } from "react";

/**
 * Drives the `` spotlight-border utility (globals.css) by writing
 * `--mx`/`--my` as the pointer moves. rAF-throttled and written straight to the
 * DOM node — never through React state — so hovering a grid of cards costs zero
 * renders. Spread the returned props onto any element that also has ``.
 */
export function useSpotlight<T extends HTMLElement = HTMLDivElement>() {
  const frame = useRef<number | null>(null);

  const onPointerMove = useCallback((event: React.PointerEvent<T>) => {
    if (frame.current !== null) return;
    const el = event.currentTarget;
    const { clientX, clientY } = event;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const rect = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${clientX - rect.left}px`);
      el.style.setProperty("--my", `${clientY - rect.top}px`);
    });
  }, []);

  return { onPointerMove };
}
