"use client";

import ReactECharts from "echarts-for-react";
import type * as Types from "@/features/telecom/types";
import { buildSuccessRateTrendOption } from "@/features/telecom/lib/chart-options";

export function SuccessRateTrendChart({ canals }: { canals: Types.CanalSummary[] }) {
  return (
    <ReactECharts
      option={buildSuccessRateTrendOption(canals)}
      style={{ height: 240 }}
      opts={{ renderer: "canvas" }}
    />
  );
}
