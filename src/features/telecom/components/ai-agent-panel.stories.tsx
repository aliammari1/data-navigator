import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import type { ColumnMapping } from "@/features/telecom/types";
import { AiAgentPanel } from "./ai-agent-panel";

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
  title: "Src/Features/Telecom/Components/AiAgentPanel",
  component: AiAgentPanel,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    // Context building and the offline model both rely on DuckDB-WASM / WebLLM,
    // which are unavailable in the Storybook sandbox. The panel's static shell
    // (toolbar, model badge, question form) renders without them.
  },
  args: {
    table: "transactions_2024_06_01",
    mapping,
    dateFrom: "2024-06-01",
    dateTo: "2024-06-01",
    onIntent: fn(),
  },
  argTypes: {
    table: { control: "text" },
    dateFrom: { control: "text" },
    dateTo: { control: "text" },
    mapping: { control: false },
    onIntent: { control: false },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 640 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AiAgentPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Agent IA · 100% offline/i)).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /Analyser maintenant/i })).toBeInTheDocument();
  },
};

export const RulesOnlyBadge: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Before the model is loaded the panel advertises rules-only inference.
    await expect(canvas.getByText(/rules-only/i)).toBeInTheDocument();
  },
};

/**
 * The question field is disabled until text is entered, then enables the submit
 * button. We drive the input to assert that gating.
 */
export const EnablesAskOnInput: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const ask = canvas.getByRole("button", { name: /Demander/i });
    await expect(ask).toBeDisabled();
    await userEvent.type(
      canvas.getByPlaceholderText(/Posez une question/i),
      "pourquoi le taux baisse ?",
    );
    await expect(ask).toBeEnabled();
  },
};

export const WeekWindow: Story = {
  args: {
    dateFrom: "2024-05-25",
    dateTo: "2024-06-01",
  },
};
