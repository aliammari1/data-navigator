"use client";

import { memo, useMemo } from "react";
import ReactECharts from "echarts-for-react";
import { buildStatusDonutOption } from "@/features/telecom/lib/chart-options";
import type * as Types from "@/features/telecom/types";

export const StatusDonut = memo(function StatusDonut({
  data,
  total: _total,
}: {
  data: Types.StatusRow[];
  total: number;
}) {
  const option = useMemo(() => buildStatusDonutOption(data), [data]);
  return (
    <ReactECharts
      option={option}
      style={{ height: 220 }}
      opts={{ renderer: "canvas" }}
    />
  );
});
