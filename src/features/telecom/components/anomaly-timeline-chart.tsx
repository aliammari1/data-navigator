"use client";

import { EChart } from "@/features/telecom/components/echart";
import { buildAnomalyTimelineOption } from "@/features/telecom/lib/chart-options";
import type * as Types from "@/features/telecom/types";

export function AnomalyTimelineChart({
  hourly,
  anomalies,
}: {
  hourly: Types.HourlyRow[];
  anomalies: Array<{ hour: number; zScore: number; type: "spike" | "drop" }>;
}) {
  return <EChart option={buildAnomalyTimelineOption(hourly, anomalies)} height={200} />;
}
