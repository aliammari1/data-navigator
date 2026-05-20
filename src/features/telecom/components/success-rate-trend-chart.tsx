"use client";

import { memo, useMemo } from "react";
import ReactECharts from "echarts-for-react";
import type * as Types from "@/features/telecom/types";
import { buildSuccessRateTrendOption } from "@/features/telecom/lib/chart-options";

export const SuccessRateTrendChart = memo(function SuccessRateTrendChart({
  canals,
}: {
  canals: Types.CanalSummary[];
}) {
  const option = useMemo(
    () => buildSuccessRateTrendOption(canals),
    [canals],
  );
  return (
    <ReactECharts
      option={option}
      style={{ height: 240 }}
      opts={{ renderer: "canvas" }}
    />
  );
});
