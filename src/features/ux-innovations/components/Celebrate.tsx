/**
 * Celebration burst — `canvas-confetti` with `useWorker: true` so particles
 * render in an OffscreenCanvas OFF the main thread, instead of competing with
 * React reconciliation + DuckDB/chart work (the frame-drop bottleneck of the
 * former main-thread `react-confetti-boom`).
 *
 * Isolated into its own module so the particle library loads only when a real
 * achievement is unlocked (via `next/dynamic` in the shell), keeping it out of
 * the feature's initial chunk. It manages its own canvas and renders no DOM.
 */

"use client";

import { useEffect } from "react";
import confetti from "canvas-confetti";

interface CelebrateProps {
  /** Called once the burst window has elapsed so the parent can unmount it. */
  onDone: () => void;
  /** Burst lifetime in ms. */
  durationMs?: number;
}

const COLORS = ["#fbbf24", "#f59e0b", "#3b82f6", "#10b981", "#8b5cf6", "#ec4899", "#06b6d4"];

export default function Celebrate({ onDone, durationMs = 2500 }: CelebrateProps) {
  useEffect(() => {
    // Off-main-thread OffscreenCanvas renderer; `resize` keeps it full-viewport.
    const myConfetti = confetti.create(undefined, { resize: true, useWorker: true });
    void myConfetti({
      particleCount: 130,
      spread: 85,
      startVelocity: 45,
      origin: { y: 0.3 },
      colors: COLORS,
      disableForReducedMotion: true,
    });
    const t = setTimeout(onDone, durationMs);
    return () => {
      clearTimeout(t);
      myConfetti.reset();
    };
  }, [onDone, durationMs]);

  return null;
}
