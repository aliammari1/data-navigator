import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import type { ColumnMapping } from "@/features/telecom/types";
import { ColumnMapper } from "@/features/telecom/components/column-mapper";

const columns = [
  "TRANSACTION_ID",
  "TRANSACTION_DATE",
  "TRANSACTION_TIME",
  "CANAL",
  "SERVICE_CODE",
  "SERVICE_NAME",
  "TRANSACTION_TYPE",
  "SUBSCRIBER_TYPE",
  "CUSTOMER_MSISDN",
  "ORIGINAL_AMOUNT",
  "TRANSACTION_STATUS",
  "ERROR_CODE",
  "ERROR_MESSAGE",
  "OPERATOR",
  "REGION",
  "PROCESSING_TIME_MS",
  "BALANCE_BEFORE",
  "BALANCE_AFTER",
  "TOTAL_AMOUNT",
  "RETRY_COUNT",
];

const defaultMapping: ColumnMapping = {
  transactionId: "TRANSACTION_ID",
  transactionDate: "TRANSACTION_DATE",
  transactionTime: "TRANSACTION_TIME",
  canal: "CANAL",
  serviceCode: "SERVICE_CODE",
  serviceName: "SERVICE_NAME",
  transactionType: "TRANSACTION_TYPE",
  subscriberType: "SUBSCRIBER_TYPE",
  msisdn: "CUSTOMER_MSISDN",
  amount: "ORIGINAL_AMOUNT",
  status: "TRANSACTION_STATUS",
  errorCode: "ERROR_CODE",
  errorMessage: "ERROR_MESSAGE",
  operator: "OPERATOR",
  region: "REGION",
  processingTimeMs: "PROCESSING_TIME_MS",
  previousBalance: "BALANCE_BEFORE",
  newBalance: "BALANCE_AFTER",
  totalAmount: "TOTAL_AMOUNT",
  retryCount: "RETRY_COUNT",
};

const meta = {
  title: "Src/Features/Telecom/Components/ColumnMapper",
  component: ColumnMapper,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    mapping: defaultMapping,
    columns,
    defaultMapping,
    onChange: fn(),
    onClose: fn(),
  },
  argTypes: {
    columns: { control: "object" },
    mapping: { control: false },
    defaultMapping: { control: false },
    onChange: { control: false },
    onClose: { control: false },
  },
} satisfies Meta<typeof ColumnMapper>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * All required fields mapped → "Appliquer le Mapping" commits and closes.
 */
export const AppliesMapping: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Appliquer le Mapping/i }));
    await expect(args.onChange).toHaveBeenCalledTimes(1);
    await expect(args.onClose).toHaveBeenCalledTimes(1);
  },
};

/**
 * A required column left unmapped disables the apply button.
 */
export const MissingRequiredField: Story = {
  args: {
    mapping: { ...defaultMapping, amount: "" },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: /Appliquer le Mapping/i })).toBeDisabled();
  },
};

export const ClosesOnCancel: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Annuler/i }));
    await expect(args.onClose).toHaveBeenCalledTimes(1);
  },
};
