"use client";

import { useEffect, useRef } from "react";
import { eyeTracker } from "../core/eyetracker";

/**
 * Attention heatmap overlay.
 *
 * Accumulates gaze samples onto a full-window canvas as additive radial
 * gradients, with a slow per-frame decay so older fixations fade and the map
 * stays responsive to where the user is currently looking. The canvas is
 * `pointer-events: none` and sits above the desktop content.
 *
 * Mounted globally by the screen via a portal to `document.body`, gated on the
 * `showHeatmap` preference.
 */
export function AttentionHeatmap() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };
    resize();
    window.addEventListener("resize", resize);

    // Pending samples drawn on the next animation frame.
    const pending: Array<{ x: number; y: number }> = [];
    const unsubscribe = eyeTracker.onGaze((x, y) => {
      pending.push({ x, y });
      // Cap the buffer so a stalled rAF can't grow it unbounded.
      if (pending.length > 240) pending.splice(0, pending.length - 240);
    });

    const RADIUS = 60; // px (CSS) of each gaze blob
    let raf = 0;

    const tick = () => {
      // Decay: fade the whole canvas slightly each frame so stale heat dissipates.
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.02)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Additively paint pending samples.
      ctx.globalCompositeOperation = "lighter";
      const r = RADIUS * dpr;
      while (pending.length > 0) {
        const sample = pending.shift();
        if (!sample) break;
        const cx = sample.x * dpr;
        const cy = sample.y * dpr;
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        // Warm editorial palette: amber core → soft rose → transparent.
        gradient.addColorStop(0, "rgba(234, 88, 12, 0.16)");
        gradient.addColorStop(0.5, "rgba(220, 38, 38, 0.08)");
        gradient.addColorStop(1, "rgba(220, 38, 38, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = "source-over";
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      unsubscribe();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[9985]"
      style={{ mixBlendMode: "multiply" }}
    />
  );
}
