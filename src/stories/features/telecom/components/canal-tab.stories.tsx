import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import type { ColumnMapping } from "@/features/telecom/types";
import { CanalTab } from "@/features/telecom/components/canal-tab";

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
  title: "Src/Features/Telecom/Components/CanalTab",
  component: CanalTab,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    // The per-section channel tables fetch via DuckDB-WASM at runtime, which is
    // unavailable in Storybook; the filter bar and section shells still render.
  },
  args: {
    getTableName: fn(() => "transactions_2024_06_01"),
    mapping,
  },
  argTypes: {
    getTableName: { control: false },
    mapping: { control: false },
  },
} satisfies Meta<typeof CanalTab>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Analyse canal par période/i)).toBeInTheDocument();
  },
};

/**
 * Toggling "Comparer les canaux" reveals the comparison panel.
 */
export const OpensComparePanel: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Comparer les canaux/i }));
    await expect(canvas.getByText(/Comparaison des canaux/i)).toBeInTheDocument();
  },
};

/**
 * Choosing the "7 jours" preset fills the date range and surfaces the active
 * window indicator.
 */
export const SelectsDatePreset: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /7 jours/i }));
    await expect(canvas.getByRole("button", { name: /Réinitialiser/i })).toBeInTheDocument();
  },
};
