import type { Meta, StoryObj } from "@storybook/nextjs";
import { expect, userEvent, within } from "storybook/test";

import type { ColumnMapping } from "@/features/telecom/types";
import { TopAccountsLeaderboard } from "./top-accounts-leaderboard";

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
 * `TopAccountsLeaderboard` reads its rows from the DuckDB-backed
 * `fetchTopAccounts` query. Without a loaded table it renders its loading then
 * empty state; the "Montant"/"Volume" toggle re-queries by the chosen metric.
 */
const meta = {
  title: "Src/Features/Telecom/Components/TopAccountsLeaderboard",
  component: TopAccountsLeaderboard,
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
} satisfies Meta<typeof TopAccountsLeaderboard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const TogglesToVolume: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const volumeBtn = canvas.getByRole("button", { name: /Volume/i });
    await userEvent.click(volumeBtn);
    await expect(volumeBtn).toBeInTheDocument();
  },
};
