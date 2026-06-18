"use client";

import { memo, useMemo } from "react";
import { EChart } from "@/features/telecom/components/echart";
import { buildStatusDonutOption } from "@/features/telecom/lib/chart-options";
import type * as Types from "@/features/telecom/types";

export const StatusDonut = memo(function StatusDonut({
  data,
  total: _total,
}: {
  data: Types.StatusRow[];
  total: number;
}) {
  const option = useMemo(() => buildStatusDonutOption(data), [data]);
  return <EChart option={option} height={220} />;
});
