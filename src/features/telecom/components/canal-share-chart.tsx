"use client";

import { memo, useMemo } from "react";
import { EChart } from "@/features/telecom/components/echart";
import { buildCanalShareOption } from "@/features/telecom/lib/chart-options";
import type * as Types from "@/features/telecom/types";

export const CanalShareChart = memo(function CanalShareChart({
  canals,
}: {
  canals: Types.CanalSummary[];
}) {
  const option = useMemo(() => buildCanalShareOption(canals), [canals]);
  return <EChart option={option} height={240} />;
});
