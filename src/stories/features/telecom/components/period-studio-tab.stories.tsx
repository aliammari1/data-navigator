import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PeriodStudioTab } from "@/features/telecom/components/period-studio-tab";
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
 * `PeriodStudioTab` orchestrates the period analytics workspace (overview,
 * comparison, leaderboard, anomaly, brands and AI sub-tabs), all sourced from
 * the DuckDB-backed period queries. Without a loaded table it renders its
 * loading/empty states; props provide the active table, mapping and an optional
 * starting period.
 */
const meta = {
  title: "Src/Features/Telecom/Components/PeriodStudioTab",
  component: PeriodStudioTab,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    table: "telecom_2024_06",
    mapping,
    initialPeriod: { from: "2024-06-01", to: "2024-06-07" },
  },
  argTypes: {
    mapping: { control: false },
    initialPeriod: { control: false },
    table: { control: "text" },
  },
  decorators: [
    (Story) => (
      <div style={{ padding: 16 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PeriodStudioTab>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SingleDay: Story = {
  args: {
    initialPeriod: { from: "2024-06-07", to: "2024-06-07" },
  },
};
