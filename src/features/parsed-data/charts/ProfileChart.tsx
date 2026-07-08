"use client";

/**
 * Thin ECharts wrapper.
 *
 * Renders through `echarts-for-react` (already a dependency) but passes
 * `notMerge`/`lazyUpdate` so option changes update the existing instance instead
 * of forcing a full chart re-init on every `profiles`/`selectedProfile` change.
 * `lazyUpdate` batches the option apply to the next frame, and `notMerge: true`
 * keeps stale series (e.g. a previous column's histogram) from bleeding through.
 */

import dynamic from "next/dynamic";
import type { CSSProperties } from "react";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

export function ProfileChart({
  option,
  style,
}: {
  option: Record<string, unknown>;
  style?: CSSProperties;
}) {
  return (
    <ReactECharts option={option} style={style} notMerge lazyUpdate opts={{ renderer: "canvas" }} />
  );
}
