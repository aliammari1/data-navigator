"use client";

import { useEffect } from "react";

/**
 * Single shared click-outside hook for shell popovers.
 *
 * The listener is only attached while `enabled` is true, so when every popover
 * in the always-mounted topbar is closed (the common case) there are zero
 * global `mousedown` listeners — replacing the previous four/five always-on
 * per-component listeners.
 */
export function useClickOutside<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  onOutside: () => void,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: MouseEvent) => {
      const node = ref.current;
      if (node && !node.contains(event.target as Node)) onOutside();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, onOutside, enabled]);
}
