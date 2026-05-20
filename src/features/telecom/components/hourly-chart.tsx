"use client";

import { memo, useMemo } from "react";
import ReactECharts from "echarts-for-react";
import type * as Types from "@/features/telecom/types";
import { buildHourlyChartOption } from "@/features/telecom/lib/chart-options";
import type { ForecastPoint } from "@/platform/browser/forecast-onnx";

export const HourlyChart = memo(function HourlyChart({
  data,
  forecast = [],
}: {
  data: Types.HourlyRow[];
  forecast?: ForecastPoint[];
}) {
  const option = useMemo(
    () => buildHourlyChartOption(data, forecast),
    [data, forecast],
  );
  return (
    <ReactECharts
      option={option}
      style={{ height: 200 }}
      opts={{ renderer: "canvas" }}
    />
  );
});
