"use client";

/**
 * React mount hook for uPlot — no wrapper dependency, ~30 lines. uPlot runs on
 * the main thread (Canvas 2D). Build `opts` ONCE per chart instance (it is only
 * read on mount); push new data via the returned ref's `setData` path.
 *
 * The required CSS is imported here exactly once (bundled, fully offline).
 */

import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { useEffect, useRef } from "react";

export function useUPlot(opts: uPlot.Options, data: uPlot.AlignedData) {
  const el = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: opts/data are read once on mount to build the chart instance; data streams via the second effect's setData.
  useEffect(() => {
    if (!el.current) return;
    plot.current = new uPlot(opts, data, el.current);
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      plot.current?.setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height || opts.height,
      });
    });
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      plot.current?.destroy();
      plot.current = null;
    };
    // opts is intentionally stable per instance — only read on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cheap streaming/refresh — never recreate the chart.
  useEffect(() => {
    plot.current?.setData(data);
  }, [data]);

  return el;
}
