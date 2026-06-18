import type { Meta, StoryObj } from "@storybook/nextjs";
import { expect, fn, userEvent, within } from "storybook/test";

import type {
  CanalSummary,
  ColumnMapping,
  HourlyRow,
  KPISummary,
  RawStatusRow,
  StatusMapping,
  StatusRow,
} from "@/features/telecom/types";
import { ConfigTab } from "./config-tab";

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

const kpi: KPISummary = {
  totalTransactions: 24812,
  successCount: 23498,
  declinedCount: 1014,
  refundCount: 180,
  instanceCount: 80,
  submittedCount: 40,
  successRate: 94.7,
  totalAmount: 18_452_300,
  avgAmount: 743.6,
  avgProcessingMs: 412,
  uniqueCustomers: 8421,
  peakHour: 18,
  topErrorCode: "INSUFFICIENT_BALANCE",
};

const canals: CanalSummary[] = [
  {
    key: "bill_payment",
    label: "Bill Payment",
    icon: () => null,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    total: 8200,
    success: 7790,
    declined: 320,
    refund: 60,
    instance: 20,
    submitted: 10,
    amount: 6_200_000,
    successRate: 95,
    avgAmount: 756,
    share: 33,
  },
];

const hourly: HourlyRow[] = Array.from({ length: 24 }, (_, hour) => ({
  hour,
  total: 600 + hour * 10,
  success: 560 + hour * 9,
  declined: 40 + hour,
  amount: (600 + hour * 10) * 740,
}));

const statusData: StatusRow[] = [
  { status: "SUCCESS", count: 23498, amount: 17_400_000 },
  { status: "DECLINED", count: 1014, amount: 720_000 },
  { status: "REFUND", count: 180, amount: 132_000 },
];

const rawStatuses: RawStatusRow[] = [
  { rawCode: "OK", count: 23498, amount: 17_400_000 },
  { rawCode: "DC01", count: 600, amount: 420_000 },
  { rawCode: "SDL9", count: 414, amount: 300_000 },
];

const statusMapping: StatusMapping[] = [
  { rawCode: "OK", label: "Succès", semantic: "success", color: "#a6e3a1", badgeClass: "bg-emerald-50" },
  { rawCode: "DC01", label: "Refusé", semantic: "declined", color: "#f38ba8", badgeClass: "bg-red-50" },
];

const meta = {
  title: "Src/Features/Telecom/Components/ConfigTab",
  component: ConfigTab,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    kpi,
    canals,
    hourly,
    statusData,
    m: mapping,
    rawStatuses,
    statusMapping,
    onStatusMappingChange: fn(),
    reportDate: "2024-06-01",
    tableName: "transactions_2024_06_01",
    fetchServiceCodeRows: async () => [],
    runCustomKPIExpr: async () => 1284,
  },
  argTypes: {
    kpi: { control: false },
    canals: { control: false },
    hourly: { control: false },
    statusData: { control: false },
    m: { control: false },
    rawStatuses: { control: false },
    statusMapping: { control: false },
    onStatusMappingChange: { control: false },
    fetchServiceCodeRows: { control: false },
    runCustomKPIExpr: { control: false },
    reportDate: { control: "text" },
    tableName: { control: "text" },
  },
} satisfies Meta<typeof ConfigTab>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * The sub-tab bar switches to the custom-KPI builder section.
 */
export const SwitchesToKPIs: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: /KPIs Personnalisés/i }),
    );
    await expect(
      canvas.getByText(/Constructeur de KPI Personnalisés/i),
    ).toBeInTheDocument();
  },
};

export const StatusSection: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: /Config\. Statuts/i }),
    );
    await expect(
      canvas.getByText(/Configuration des Codes Statut/i),
    ).toBeInTheDocument();
  },
};
