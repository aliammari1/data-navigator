"use client";

import ReactECharts from "echarts-for-react";
import type * as Types from "@/features/telecom/types";
import { buildCanalShareOption } from "@/features/telecom/lib/chart-options";

export function CanalShareChart({ canals }: { canals: Types.CanalSummary[] }) {
  return (
    <ReactECharts
      option={buildCanalShareOption(canals)}
      style={{ height: 240 }}
      opts={{ renderer: "canvas" }}
    />
  );
}
