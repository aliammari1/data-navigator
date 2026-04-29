"use client";

import ReactECharts from "echarts-for-react";
import type * as Types from "@/features/telecom/types";
import { buildErrorFreqOption } from "@/features/telecom/lib/chart-options";

export function ErrorFreqChart({ errors }: { errors: Types.ErrorRow[] }) {
  return (
    <ReactECharts
      option={buildErrorFreqOption(errors)}
      style={{ height: 280 }}
      opts={{ renderer: "canvas" }}
    />
  );
}
