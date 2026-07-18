"use client";

import { memo, useMemo } from "react";
import { EChart } from "@/features/telecom/components/echart";
import { buildHourlyChartOption } from "@/features/telecom/lib/chart-options";
import type * as Types from "@/features/telecom/types";

export const HourlyChart = memo(function HourlyChart({
  data,
}: {
  data: Types.HourlyRow[];
}) {
  const option = useMemo(() => buildHourlyChartOption(data), [data]);
  return <EChart option={option} height={200} />;
});
