"use client";

import ReactECharts from "echarts-for-react";
import type * as Types from "@/features/telecom/types";
import { buildRiskScoreOption } from "@/features/telecom/lib/chart-options";

export function RiskScoreChart({ canals }: { canals: Types.CanalSummary[] }) {
  return (
    <ReactECharts
      option={buildRiskScoreOption(canals)}
      style={{ height: 200 }}
      opts={{ renderer: "canvas" }}
    />
  );
}
