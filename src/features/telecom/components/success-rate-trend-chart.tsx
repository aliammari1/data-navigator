"use client";

import { memo, useMemo } from "react";
import { EChart } from "@/features/telecom/components/echart";
import { buildSuccessRateTrendOption } from "@/features/telecom/lib/chart-options";
import type * as Types from "@/features/telecom/types";

export const SuccessRateTrendChart = memo(function SuccessRateTrendChart({
  canals,
}: {
  canals: Types.CanalSummary[];
}) {
  const option = useMemo(() => buildSuccessRateTrendOption(canals), [canals]);
  return <EChart option={option} height={240} />;
});
