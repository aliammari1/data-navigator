"use client";

import { memo, useMemo } from "react";
import { EChart } from "@/features/telecom/components/echart";
import { buildRevenuePieOption } from "@/features/telecom/lib/chart-options";
import { REVENUE_GROUPS } from "@/features/telecom/lib/revenue-groups";
import type * as Types from "@/features/telecom/types";

export const AmountPieChart = memo(function AmountPieChart({
  canals,
}: {
  canals: Types.CanalSummary[];
}) {
  const grouped = useMemo(
    () =>
      Object.entries(REVENUE_GROUPS)
        .map(([name, { keys, color }]) => ({
          name,
          value: canals
            .filter((c) => keys.includes(c.key))
            .reduce((s, c) => s + c.amount, 0),
          color,
        }))
        .filter((g) => g.value > 0)
        .sort((a, b) => b.value - a.value),
    [canals],
  );

  const option = useMemo(() => buildRevenuePieOption(grouped), [grouped]);

  return <EChart option={option} height={220} />;
});
