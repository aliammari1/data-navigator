import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PeriodComparePanel } from "@/features/telecom/components/period-compare-panel";
import type { ColumnMapping } from "@/features/telecom/types";

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
 * `PeriodComparePanel` queries `fetchPeriodKPI` (DuckDB-backed) for each period.
 * Without a loaded table it shows its empty/loading state; props provide the
 * active table, the column mapping and the two periods (A vs B) to compare.
 */
const meta = {
  title: "Src/Features/Telecom/Components/PeriodComparePanel",
  component: PeriodComparePanel,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    table: "telecom_2024_06",
    mapping,
    initialA: { from: "2024-06-01", to: "2024-06-07" },
    initialB: { from: "2024-05-25", to: "2024-05-31" },
  },
  argTypes: {
    mapping: { control: false },
    initialA: { control: false },
    initialB: { control: false },
    table: { control: "text" },
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 900, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PeriodComparePanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SingleDayVsSingleDay: Story = {
  args: {
    initialA: { from: "2024-06-07", to: "2024-06-07" },
    initialB: { from: "2024-06-06", to: "2024-06-06" },
  },
};
