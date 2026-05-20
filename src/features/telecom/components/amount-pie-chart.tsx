"use client";

import { memo, useMemo } from "react";
import ReactECharts from "echarts-for-react";
import { buildRevenuePieOption } from "@/features/telecom/lib/chart-options";
import type * as Types from "@/features/telecom/types";

import { REVENUE_GROUPS } from "@/features/telecom/lib/revenue-groups";

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

  return (
    <ReactECharts
      option={option}
      style={{ height: 220 }}
      opts={{ renderer: "canvas" }}
    />
  );
});
