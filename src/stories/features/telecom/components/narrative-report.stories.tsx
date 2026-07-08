import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CreditCard, Phone } from "lucide-react";

import type { CanalSummary, HourlyRow, KPISummary } from "@/features/telecom/types";
import { NarrativeReport } from "@/features/telecom/components/narrative-report";

const kpi: KPISummary = {
  totalTransactions: 24_812,
  successCount: 23_874,
  declinedCount: 612,
  refundCount: 84,
  instanceCount: 198,
  submittedCount: 44,
  successRate: 96.2,
  totalAmount: 451_300.5,
  avgAmount: 18.4,
  avgProcessingMs: 320,
  uniqueCustomers: 8_412,
  peakHour: 12,
  topErrorCode: "51",
};

const canals: CanalSummary[] = [
  {
    key: "bill_payment",
    label: "Paiement facture",
    icon: CreditCard,
    color: "text-indigo-500",
    bgColor: "bg-indigo-500/10",
    borderColor: "border-indigo-500/20",
    total: 12_400,
    success: 11_980,
    declined: 320,
    refund: 60,
    instance: 30,
    submitted: 10,
    amount: 248_100.5,
    successRate: 96.6,
    avgAmount: 20.0,
    share: 0.5,
  },
  {
    key: "voice_mobile_ttcash",
    label: "Recharge mobile TTcash",
    icon: Phone,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
    total: 8_100,
    success: 7_540,
    declined: 480,
    refund: 50,
    instance: 20,
    submitted: 10,
    amount: 121_500.0,
    successRate: 93.1,
    avgAmount: 15.0,
    share: 0.33,
  },
];

const hourly: HourlyRow[] = Array.from({ length: 24 }, (_, hour) => {
  const total = Math.max(60, Math.round(400 + 900 * Math.sin((hour / 24) * Math.PI)));
  const declined = Math.round(total * 0.04);
  return { hour, total, success: total - declined, declined, amount: total * 18.4 };
});

const meta = {
  title: "Src/Features/Telecom/Components/NarrativeReport",
  component: NarrativeReport,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    kpi,
    canals,
    hourly,
    reportDate: "2024-06-01",
  },
  argTypes: {
    kpi: { control: false },
    canals: { control: false },
    hourly: { control: false },
    reportDate: { control: "text" },
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 720, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NarrativeReport>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const LowSuccessRate: Story = {
  args: {
    kpi: {
      ...kpi,
      successRate: 78.4,
      successCount: 19_452,
      declinedCount: 5_360,
    },
  },
};
