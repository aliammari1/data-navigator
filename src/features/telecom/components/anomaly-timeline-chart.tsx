"use client";

import ReactECharts from "echarts-for-react";
import type * as Types from "@/features/telecom/types";
import { buildAnomalyTimelineOption } from "@/features/telecom/lib/chart-options";

export function AnomalyTimelineChart({
  hourly,
  anomalies,
}: {
  hourly: Types.HourlyRow[];
  anomalies: Array<{ hour: number; zScore: number; type: "spike" | "drop" }>;
}) {
  return (
    <ReactECharts
      option={buildAnomalyTimelineOption(hourly, anomalies)}
      style={{ height: 200 }}
      opts={{ renderer: "canvas" }}
    />
  );
}
