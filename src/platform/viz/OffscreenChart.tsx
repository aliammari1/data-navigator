"use client";

/**
 * OffscreenChart — renders an ECharts option off the main thread via the shared
 * chart.worker + a transferred OffscreenCanvas. When OffscreenCanvas/Worker is
 * unavailable, `onUnsupported` fires so the caller can render an
 * `echarts-for-react` fallback (passing the SAME tree-shaken `echarts` core
 * from `echarts-core.ts`, never the full build).
 */

import * as Comlink from "comlink";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { getChartProxy, nextChartId } from "./chart-client";
import type { EChartsOption } from "./echarts-core";

/**
 * The worker receives options via structured clone (`postMessage`), which cannot
 * clone functions. ECharts options frequently carry function `formatter`s, label
 * callbacks, etc. Detect those so the caller's main-thread fallback renders them
 * instead of throwing a `DataCloneError` in the worker.
 */
function hasFunctionValue(value: unknown, depth = 0): boolean {
  if (value == null || depth > 8) return false;
  if (typeof value === "function") return true;
  if (Array.isArray(value)) {
    return value.some((entry) => hasFunctionValue(entry, depth + 1));
  }
  if (typeof value === "object") {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      if (hasFunctionValue(entry, depth + 1)) return true;
    }
  }
  return false;
}

export interface OffscreenChartProps {
  option: EChartsOption;
  height: number;
  className?: string;
  theme?: string;
  /** Rendered instead of the canvas when off-main-thread render is unavailable. */
  fallback?: ReactNode;
}

export function OffscreenChart({
  option,
  height,
  className,
  theme,
  fallback,
}: OffscreenChartProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const idRef = useRef<number>(nextChartId());
  const apiRef = useRef<ReturnType<typeof getChartProxy>>(null);
  const transferredRef = useRef(false);
  const disposeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Options carrying functions (formatters, label callbacks) can't be cloned to
  // the worker — render the main-thread fallback for those instead.
  const cloneable = useMemo(() => !hasFunctionValue(option), [option]);
  const useFallback =
    typeof window !== "undefined" &&
    !!fallback &&
    (!getChartProxy() || !cloneable);

  // biome-ignore lint/correctness/useExhaustiveDependencies: height/theme seed the one-time init; the canvas can only be transferred once on mount, and live updates flow through resize/setOption.
  useEffect(() => {
    const proxy = getChartProxy();
    const canvas = ref.current;
    if (!proxy || !canvas) return;
    apiRef.current = proxy;
    const id = idRef.current;

    // Cancel a disposal deferred by a StrictMode fake-unmount so the worker
    // chart stays alive across the immediate remount.
    if (disposeTimerRef.current !== null) {
      clearTimeout(disposeTimerRef.current);
      disposeTimerRef.current = null;
    }

    // A canvas can only be transferred once — do it (and seed the chart) a
    // single time per element, guarding against StrictMode double-invoke.
    if (!transferredRef.current) {
      let off: OffscreenCanvas;
      try {
        off = canvas.transferControlToOffscreen();
      } catch {
        // Already transferred or unsupported — leave it to the fallback.
        return;
      }
      transferredRef.current = true;
      const rect = canvas.getBoundingClientRect();
      const dpr =
        typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      void proxy.init(
        id,
        Comlink.transfer(off, [off]),
        dpr,
        rect.width || canvas.clientWidth || 600,
        rect.height || height,
        theme,
      );
    }

    const move = (e: PointerEvent) => void proxy.showTip(id, e.offsetX, e.offsetY);
    const leave = () => void proxy.hideTip(id);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerleave", leave);
    const ro = new ResizeObserver(([entry]) => {
      if (entry) void proxy.resize(id, entry.contentRect.width, entry.contentRect.height);
    });
    ro.observe(canvas);

    return () => {
      ro.disconnect();
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerleave", leave);
      // Defer disposal: a StrictMode remount cancels it; a real unmount lets it run.
      disposeTimerRef.current = setTimeout(() => {
        void proxy.dispose(id);
        disposeTimerRef.current = null;
      }, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (apiRef.current && transferredRef.current) {
      void apiRef.current.setOption(idRef.current, option);
    }
  }, [option]);

  // No off-main-thread support, or a non-cloneable option → render the
  // caller's main-thread fallback.
  if (useFallback) {
    return <>{fallback}</>;
  }

  return <canvas ref={ref} className={className} style={{ width: "100%", height }} />;
}
