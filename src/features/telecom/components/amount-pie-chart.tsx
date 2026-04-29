"use client";

import ReactECharts from "echarts-for-react";
import type * as Types from "@/features/telecom/types";
import { buildRevenuePieOption } from "@/features/telecom/lib/chart-options";

// Group canals into 5 high-level categories for revenue display
const REVENUE_GROUPS: Record<
  string,
  { keys: Types.CanalKey[]; color: string }
> = {
  "Bill Payment": {
    keys: ["bill_payment"],
    color: "#89b4fa",
  },
  Recharge: {
    keys: [
      "voice_fixed_ttcash",
      "voice_fixed_voucher",
      "voice_mobile_ttcash",
      "voice_mobile_voucher",
      "data_sabba",
      "data_evoucher",
    ],
    color: "#a6e3a1",
  },
  "Voucher For Payment": {
    keys: ["voucher_for_payment"],
    color: "#94e2d5",
  },
  "Credit Transfer": {
    keys: ["credit_transfer"],
    color: "#fab387",
  },
  "Voucher For Recharge": {
    keys: ["voucher_convergent"],
    color: "#cba6f7",
  },
};

export function AmountPieChart({ canals }: { canals: Types.CanalSummary[] }) {
  const grouped = Object.entries(REVENUE_GROUPS)
    .map(([name, { keys, color }]) => ({
      name,
      value: canals.filter((c) => keys.includes(c.key)).reduce((s, c) => s + c.amount, 0),
      color,
    }))
    .filter((g) => g.value > 0)
    .sort((a, b) => b.value - a.value);
  return (
    <ReactECharts
      option={buildRevenuePieOption(grouped)}
      style={{ height: 220 }}
      opts={{ renderer: "canvas" }}
    />
  );
}
