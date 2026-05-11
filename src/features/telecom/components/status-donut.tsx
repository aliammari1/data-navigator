"use client";

import ReactECharts from "echarts-for-react";
import { buildStatusDonutOption } from "@/features/telecom/lib/chart-options";
import type * as Types from "@/features/telecom/types";

export function StatusDonut({
  data,
  total: _total,
}: {
  data: Types.StatusRow[];
  total: number;
}) {
  return (
    <ReactECharts
      option={buildStatusDonutOption(data)}
      style={{ height: 220 }}
      opts={{ renderer: "canvas" }}
    />
  );
}

