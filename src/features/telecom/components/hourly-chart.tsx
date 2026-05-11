"use client";

import ReactECharts from "echarts-for-react";
import type * as Types from "@/features/telecom/types";
import { buildHourlyChartOption } from "@/features/telecom/lib/chart-options";
import type { ForecastPoint } from "@/platform/browser/forecast-onnx";

export function HourlyChart({
  data,
  forecast = [],
}: {
  data: Types.HourlyRow[];
  forecast?: ForecastPoint[];
}) {
  return (
    <ReactECharts
      option={buildHourlyChartOption(data, forecast)}
      style={{ height: 200 }}
      opts={{ renderer: "canvas" }}
    />
  );
}
