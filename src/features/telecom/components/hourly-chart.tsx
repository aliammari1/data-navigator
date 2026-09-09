"use client";

import { memo, useMemo } from "react";
import { EChart } from "@/features/telecom/components/echart";
import { buildHourlyChartOption } from "@/features/telecom/lib/chart-options";
import type * as Types from "@/features/telecom/types";
import type { ForecastPoint } from "@/platform/browser/forecast-onnx";

export const HourlyChart = memo(function HourlyChart({
  data,
  forecast = [],
}: {
  data: Types.HourlyRow[];
  forecast?: ForecastPoint[];
}) {
  const option = useMemo(() => buildHourlyChartOption(data, forecast), [data, forecast]);
  return <EChart option={option} height={200} />;
});
