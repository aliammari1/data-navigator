"use client";

/**
 * AgentChart — heavy ECharts widget surface rendered OFF the main thread via the
 * shared `OffscreenChart` worker (OffscreenCanvas), with an `echarts-for-react`
 * fallback bound to the SAME tree-shaken `echarts/core` instance.
 *
 * Widgets live in a flex-fill card, so we measure the container and feed a
 * concrete pixel height to OffscreenChart (whose canvas needs a number).
 */

import ReactEChartsCore from "echarts-for-react/lib/core";
import { useEffect, useRef, useState } from "react";
import { type EChartsOption, OffscreenChart, supportsOffscreenChart } from "@/platform/viz";
import { echarts } from "@/platform/viz/echarts-core";
import { cn } from "@/shared/utils";

interface Props {
  option: EChartsOption;
  className?: string;
}

export function AgentChart({ option, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const h = entry?.contentRect.height;
      if (h && h > 0) setHeight(Math.round(h));
    });
    ro.observe(el);
    const rect = el.getBoundingClientRect();
    if (rect.height > 0) setHeight(Math.round(rect.height));
    return () => ro.disconnect();
  }, []);

  const fallback = (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      style={{ height: height || "100%", width: "100%" }}
      lazyUpdate
      notMerge
      theme="dark"
    />
  );

  return (
    <div ref={ref} className={cn("h-full w-full", className)}>
      {height > 0 &&
        (supportsOffscreenChart() ? (
          <OffscreenChart option={option} height={height} theme="dark" fallback={fallback} />
        ) : (
          fallback
        ))}
    </div>
  );
}
