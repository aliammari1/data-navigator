"use client";

import { memo, useMemo } from "react";
import ReactECharts from "echarts-for-react";
import type * as Types from "@/features/telecom/types";
import { buildCanalShareOption } from "@/features/telecom/lib/chart-options";

export const CanalShareChart = memo(function CanalShareChart({
  canals,
}: {
  canals: Types.CanalSummary[];
}) {
  const option = useMemo(() => buildCanalShareOption(canals), [canals]);
  return (
    <ReactECharts
      option={option}
      style={{ height: 240 }}
      opts={{ renderer: "canvas" }}
    />
  );
});
