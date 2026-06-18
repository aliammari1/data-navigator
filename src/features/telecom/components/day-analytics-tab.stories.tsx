import type { Meta, StoryObj } from "@storybook/nextjs";

import type { ColumnMapping, LoadedFile } from "@/features/telecom/types";
import { DayAnalyticsTab } from "./day-analytics-tab";

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

const loadedFiles: LoadedFile[] = [
  {
    id: 1,
    name: "transactions_2024-06-01.csv",
    table: "tx_2024_06_01",
    date: "2024-06-01",
    cacheKey: "cache-2024-06-01",
    size: 4_820_000,
    lastModified: new Date("2024-06-01T08:12:00").getTime(),
    sourceKeys: ["src-1"],
  },
  {
    id: 2,
    name: "transactions_2024-05-31.csv",
    table: "tx_2024_05_31",
    date: "2024-05-31",
    cacheKey: "cache-2024-05-31",
    size: 3_140_000,
    lastModified: new Date("2024-05-31T19:45:00").getTime(),
    sourceKeys: ["src-2"],
  },
];

const meta = {
  title: "Src/Features/Telecom/Components/DayAnalyticsTab",
  component: DayAnalyticsTab,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    // Day data is queried via DuckDB-WASM at runtime, which is unavailable in
    // the Storybook sandbox; the day selector and shell still render.
  },
  args: {
    table: "tx_2024_06_01",
    mapping,
    fileName: "transactions_2024-06-01.csv",
    loadedFiles,
  },
  argTypes: {
    table: { control: "text" },
    fileName: { control: "text" },
    mapping: { control: false },
    loadedFiles: { control: false },
  },
} satisfies Meta<typeof DayAnalyticsTab>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SingleFile: Story = {
  args: {
    loadedFiles: [loadedFiles[0]],
  },
};

export const NoFiles: Story = {
  args: {
    loadedFiles: [],
  },
};
