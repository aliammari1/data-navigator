import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { ColumnMapping, DailyTrendRow } from "@/features/telecom/types";
import { DailyTrendChart } from "@/features/telecom/components/daily-trend-chart";

const mapping: ColumnMapping = {
  transactionId: "transaction_id",
  transactionDate: "transaction_date",
  transactionTime: "transaction_time",
  canal: "canal",
  serviceCode: "service_code",
  serviceName: "service_name",
  transactionType: "transaction_type",
  subscriberType: "subscriber_type",
  msisdn: "msisdn",
  amount: "amount",
  status: "status",
  errorCode: "error_code",
  errorMessage: "error_message",
  operator: "operator",
  region: "region",
  processingTimeMs: "processing_time_ms",
  previousBalance: "previous_balance",
  newBalance: "new_balance",
  totalAmount: "total_amount",
  retryCount: "retry_count",
};

const trend: DailyTrendRow[] = Array.from({ length: 14 }, (_, i) => {
  const day = `2024-05-${String(19 + i).padStart(2, "0")}`;
  const total = 22000 + Math.round(3000 * Math.sin(i / 2)) + i * 120;
  const success = Math.round(total * (0.9 + 0.05 * Math.sin(i)));
  return { day, total, success, declined: total - success, amount: total * 740 };
});

const meta = {
  title: "Src/Features/Telecom/Components/DailyTrendChart",
  component: DailyTrendChart,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: {
    m: mapping,
    fetchDailyTrend: async () => trend,
  },
  argTypes: {
    m: { control: false },
    fetchDailyTrend: { control: false },
  },
} satisfies Meta<typeof DailyTrendChart>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const TwoDays: Story = {
  args: {
    fetchDailyTrend: async () => trend.slice(0, 2),
  },
};

/**
 * A single day cannot form a trend line, so the component renders nothing.
 */
export const InsufficientData: Story = {
  args: {
    fetchDailyTrend: async () => trend.slice(0, 1),
  },
};
