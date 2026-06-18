import type { Meta, StoryObj } from "@storybook/nextjs";

import type { CanalHourCell, ColumnMapping } from "@/features/telecom/types";
import { CanalHeatmap } from "./canal-heatmap";

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

const canalLabels = [
  "Bill Payment",
  "Mobile by TTCASH",
  "Internet Sabba",
  "Credit Transfer",
];

const matrix: CanalHourCell[] = canalLabels.flatMap((canal) =>
  Array.from({ length: 24 }, (_, hour) => {
    const total = 50 + Math.round(450 * Math.sin((hour / 24) * Math.PI));
    return { canal, hour, total, success: Math.round(total * 0.92) };
  }),
);

const meta = {
  title: "Src/Features/Telecom/Components/CanalHeatmap",
  component: CanalHeatmap,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: {
    m: mapping,
    fetchCanalHourlyMatrix: async () => matrix,
  },
  argTypes: {
    m: { control: false },
    fetchCanalHourlyMatrix: { control: false },
  },
} satisfies Meta<typeof CanalHeatmap>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SingleCanal: Story = {
  args: {
    fetchCanalHourlyMatrix: async () =>
      matrix.filter((c) => c.canal === "Bill Payment"),
  },
};

/**
 * When the matrix resolves empty the component renders nothing (after loading).
 */
export const Empty: Story = {
  args: {
    fetchCanalHourlyMatrix: async () => [],
  },
};
