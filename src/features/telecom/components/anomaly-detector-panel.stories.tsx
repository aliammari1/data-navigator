import type { Meta, StoryObj } from "@storybook/nextjs";

import type { ColumnMapping } from "@/features/telecom/types";
import { AnomalyDetectorPanel } from "./anomaly-detector-panel";

/**
 * The default column mapping used across the telecom feature — column names map
 * one-to-one onto a transaction CSV header.
 */
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

const meta = {
  title: "Src/Features/Telecom/Components/AnomalyDetectorPanel",
  component: AnomalyDetectorPanel,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    // Data is fetched at runtime via DuckDB-WASM, which is unavailable in the
    // Storybook sandbox; the panel falls back to its safe empty state.
  },
  args: {
    table: "transactions_2024_06_01",
    mapping,
    dateFrom: "2024-06-01",
    dateTo: "2024-06-01",
  },
  argTypes: {
    table: { control: "text" },
    dateFrom: { control: "text" },
    dateTo: { control: "text" },
    mapping: { control: false },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 560 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AnomalyDetectorPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SingleDayWindow: Story = {
  args: {
    table: "transactions_2024_05_31",
    dateFrom: "2024-05-31",
    dateTo: "2024-05-31",
  },
};

export const WeekWindow: Story = {
  args: {
    dateFrom: "2024-05-25",
    dateTo: "2024-06-01",
  },
};
