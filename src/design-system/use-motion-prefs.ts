"use client";

import { useEffect, useState } from "react";

/**
 * Single source of truth for "should this surface animate?".
 *
 * Combines the OS `prefers-reduced-motion` signal with the app's own
 * Settings → "Réduire les animations" switch, which writes
 * `data-animations="off"` on <html> (see globals.css kill-switch). Every motion
 * primitive reads this so one toggle calms the entire app on medium-end PCs.
 */
export function useMotionPrefs(): { reduced: boolean } {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const root = document.documentElement;

    const compute = () => setReduced(media.matches || root.dataset.animations === "off");

    compute();
    media.addEventListener("change", compute);

    const observer = new MutationObserver(compute);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-animations"],
    });

    return () => {
      media.removeEventListener("change", compute);
      observer.disconnect();
    };
  }, []);

  return { reduced };
}
