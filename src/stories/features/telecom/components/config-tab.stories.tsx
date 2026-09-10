import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { ConfigTab } from "@/features/telecom/components/config-tab";
import type { ColumnMapping, RawStatusRow, StatusMapping } from "@/features/telecom/types";

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

const rawStatuses: RawStatusRow[] = [
  { rawCode: "OK", count: 23498, amount: 17_400_000 },
  { rawCode: "DC01", count: 600, amount: 420_000 },
  { rawCode: "SDL9", count: 414, amount: 300_000 },
];

const statusMapping: StatusMapping[] = [
  {
    rawCode: "OK",
    label: "Succès",
    semantic: "success",
    color: "#a6e3a1",
    badgeClass: "bg-emerald-50",
  },
  {
    rawCode: "DC01",
    label: "Refusé",
    semantic: "declined",
    color: "#f38ba8",
    badgeClass: "bg-red-50",
  },
];

const meta = {
  title: "Src/Features/Telecom/Components/ConfigTab",
  component: ConfigTab,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    m: mapping,
    rawStatuses,
    statusMapping,
    onStatusMappingChange: fn(),
    tableName: "transactions_2024_06_01",
    fetchServiceCodeRows: async () => [],
  },
  argTypes: {
    m: { control: false },
    rawStatuses: { control: false },
    statusMapping: { control: false },
    onStatusMappingChange: { control: false },
    fetchServiceCodeRows: { control: false },
    tableName: { control: "text" },
  },
} satisfies Meta<typeof ConfigTab>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const StatusSection: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Config\. Statuts/i }));
    await expect(canvas.getByText(/Configuration des Codes Statut/i)).toBeInTheDocument();
  },
};
