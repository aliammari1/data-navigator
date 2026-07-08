"use client";

import { EChart } from "@/features/telecom/components/echart";
import { buildRiskScoreOption } from "@/features/telecom/lib/chart-options";
import type * as Types from "@/features/telecom/types";

export function RiskScoreChart({ canals }: { canals: Types.CanalSummary[] }) {
  return <EChart option={buildRiskScoreOption(canals)} height={200} />;
}
