import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { FileText, Smartphone } from "lucide-react";

import type { CanalSummary, HourlyRow, KPISummary, StatusRow } from "@/features/telecom/types";
import { DeepAnalysisPanel } from "./deep-analysis-panel";

const kpi: KPISummary = {
  totalTransactions: 24812,
  successCount: 23498,
  declinedCount: 1014,
  refundCount: 180,
  instanceCount: 80,
  submittedCount: 40,
  successRate: 94.7,
  totalAmount: 18_452_300,
  avgAmount: 743.6,
  avgProcessingMs: 412,
  uniqueCustomers: 8421,
  peakHour: 18,
  topErrorCode: "INSUFFICIENT_BALANCE",
};

const baseCanal: Omit<CanalSummary, "key" | "label" | "icon" | "successRate"> = {
  color: "text-blue-600",
  bgColor: "bg-blue-50",
  borderColor: "border-blue-200",
  total: 8200,
  success: 7790,
  declined: 320,
  refund: 60,
  instance: 20,
  submitted: 10,
  amount: 6_200_000,
  avgAmount: 756,
  share: 33,
};

const canals: CanalSummary[] = [
  { ...baseCanal, key: "bill_payment", label: "Bill Payment", icon: FileText, successRate: 95 },
  {
    ...baseCanal,
    key: "data_evoucher",
    label: "Data by Voucher",
    icon: Smartphone,
    successRate: 68.4,
    total: 900,
    success: 616,
    declined: 284,
  },
];

const hourly: HourlyRow[] = Array.from({ length: 24 }, (_, hour) => {
  const total = 300 + Math.round(900 * Math.sin((hour / 24) * Math.PI));
  return {
    hour,
    total,
    success: Math.round(total * 0.94),
    declined: Math.round(total * 0.06),
    amount: total * 740,
  };
});
// An obvious spike at 13h to surface an anomaly.
hourly[13] = { hour: 13, total: 3200, success: 2100, declined: 1100, amount: 2_368_000 };

const statusData: StatusRow[] = [
  { status: "SUCCESS", count: 23498, amount: 17_400_000 },
  { status: "DECLINED", count: 1014, amount: 720_000 },
  { status: "REFUND", count: 180, amount: 132_000 },
];

const meta = {
  title: "Src/Features/Telecom/Components/DeepAnalysisPanel",
  component: DeepAnalysisPanel,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    kpi,
    canals,
    hourly,
    statusData,
    reportDate: "2024-06-01",
  },
  argTypes: {
    kpi: { control: false },
    canals: { control: false },
    hourly: { control: false },
    statusData: { control: false },
    reportDate: { control: "text" },
  },
} satisfies Meta<typeof DeepAnalysisPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const HealthyMetrics: Story = {
  args: {
    canals: [
      { ...baseCanal, key: "bill_payment", label: "Bill Payment", icon: FileText, successRate: 97 },
    ],
    kpi: { ...kpi, successRate: 97.2, declinedCount: 420 },
  },
};

export const CriticalDegradation: Story = {
  args: {
    kpi: { ...kpi, successRate: 71.4, declinedCount: 6200 },
  },
};
