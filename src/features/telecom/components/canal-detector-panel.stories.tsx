import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";

import type { ColumnMapping, ServiceCodeRow } from "@/features/telecom/types";
import { CanalDetectorPanel } from "./canal-detector-panel";

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

const rows: ServiceCodeRow[] = [
  { serviceCode: "BILL_PAY_FIXE", category: "Facture", count: 8200, matchedCanal: "Bill Payment" },
  {
    serviceCode: "BILL_PAY_MOBILE",
    category: "Facture",
    count: 3100,
    matchedCanal: "Bill Payment",
  },
  {
    serviceCode: "RECHARGE_TTCASH_MOBILE",
    category: "Recharge",
    count: 6400,
    matchedCanal: "Mobile by TTCASH",
  },
  { serviceCode: "RECHARGE_SABBA", category: "Data", count: 4100, matchedCanal: "Internet Sabba" },
  { serviceCode: "UNKNOWN_SVC_42", category: "", count: 320, matchedCanal: "Other" },
  { serviceCode: "LEGACY_TOPUP", category: "Inconnu", count: 95, matchedCanal: "Other" },
];

const meta = {
  title: "Src/Features/Telecom/Components/CanalDetectorPanel",
  component: CanalDetectorPanel,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: {
    m: mapping,
    fetchServiceCodeRows: async () => rows,
  },
  argTypes: {
    m: { control: false },
    fetchServiceCodeRows: { control: false },
  },
} satisfies Meta<typeof CanalDetectorPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Motifs distincts/i)).toBeInTheDocument();
  },
};

export const AllClassified: Story = {
  args: {
    fetchServiceCodeRows: async () => rows.filter((r) => r.matchedCanal !== "Other"),
  },
};

export const Empty: Story = {
  args: {
    fetchServiceCodeRows: async () => [],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Aucune donnée de code de service/i)).toBeInTheDocument();
  },
};

/**
 * The "Actualiser" button bumps an internal refresh key, re-running the fetcher.
 */
export const RefreshesOnClick: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const refresh = canvas.getByRole("button", { name: /Actualiser/i });
    await userEvent.click(refresh);
    await expect(canvas.getByText(/Motifs distincts/i)).toBeInTheDocument();
  },
};
