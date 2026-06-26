import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { ColumnMapping } from "@/features/telecom/types";
import { SubStatusPanel } from "@/features/telecom/components/sub-status-panel";

const mapping: ColumnMapping = {
  transactionId: "TRANSACTION_ID",
  transactionDate: "TRANSACTION_DATE",
  transactionTime: "TRANSACTION_TIME",
  canal: "CANAL",
  serviceCode: "SERVICE_CODE",
  serviceName: "SERVICE_NAME",
  transactionType: "TRANSACTION_TYPE",
  subscriberType: "SUBSCRIBER_TYPE",
  msisdn: "MSISDN",
  amount: "AMOUNT",
  status: "STATUS",
  errorCode: "ERROR_CODE",
  errorMessage: "ERROR_MESSAGE",
  operator: "OPERATOR",
  region: "REGION",
  processingTimeMs: "PROCESSING_TIME_MS",
  previousBalance: "PREVIOUS_BALANCE",
  newBalance: "NEW_BALANCE",
  totalAmount: "TOTAL_AMOUNT",
  retryCount: "RETRY_COUNT",
};

/**
 * `SubStatusPanel` fetches its breakdown from the DuckDB-backed
 * `fetchSubStatusBreakdown` query. Without a loaded table (as in Storybook)
 * it renders its empty/loading state; props supply the active table, column
 * mapping and the period to query.
 */
const meta = {
  title: "Src/Features/Telecom/Components/SubStatusPanel",
  component: SubStatusPanel,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    table: "telecom_2024_06_01",
    mapping,
    dateFrom: "2024-06-01",
    dateTo: "2024-06-01",
  },
  argTypes: {
    mapping: { control: false },
    table: { control: "text" },
    dateFrom: { control: "text" },
    dateTo: { control: "text" },
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 900, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SubStatusPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SingleDay: Story = {
  args: {
    dateFrom: "2024-06-02",
    dateTo: "2024-06-02",
  },
};

export const NoPeriodSelected: Story = {
  args: {
    dateFrom: "",
    dateTo: "",
  },
};
