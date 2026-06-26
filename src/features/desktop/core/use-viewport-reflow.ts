"use client";

import { useEffect } from "react";
import { getDesktopCanvas } from "@/features/desktop/core/layout";
import { useDesktopStore } from "@/features/desktop/store/desktop-store";

/**
 * Keep open windows fitted to the live desktop canvas.
 *
 * Runs once after first paint — so windows persisted from a larger display (or
 * opened before the canvas settled) are pulled back on-screen — and again,
 * rAF-debounced, on every viewport resize. Maximised windows refill the new
 * usable canvas; floating windows are clamped so their titlebar stays grabbable.
 *
 * Reads/writes the store imperatively (no re-render of the host component).
 */
export function useViewportReflow(): void {
  useEffect(() => {
    let raf = 0;
    const reflow = () => {
      raf = 0;
      useDesktopStore.getState().reflowWindows(getDesktopCanvas());
    };
    const schedule = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(reflow);
    };

    schedule(); // initial fit once the canvas is measurable
    window.addEventListener("resize", schedule);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
    };
  }, []);
}
