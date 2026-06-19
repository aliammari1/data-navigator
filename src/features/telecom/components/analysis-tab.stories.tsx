import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type {
  CanalHourCell,
  ColumnMapping,
  HourlyRow,
  KPISummary,
  OperatorRow,
  RegionRow,
} from "@/features/telecom/types";
import { AnalysisTab } from "./analysis-tab";

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

const hourly: HourlyRow[] = Array.from({ length: 24 }, (_, hour) => {
  const base = 300 + Math.round(900 * Math.sin((hour / 24) * Math.PI));
  return {
    hour,
    total: base,
    success: Math.round(base * 0.94),
    declined: Math.round(base * 0.06),
    amount: base * 740,
  };
});

const operators: OperatorRow[] = [
  { operator: "Tunisie Telecom", total: 9200, success: 8740, amount: 6_900_000, successRate: 95, accountType: "source" },
  { operator: "Ooredoo", total: 7400, success: 6810, amount: 5_300_000, successRate: 92, accountType: "source" },
  { operator: "Orange Tunisie", total: 5100, success: 4590, amount: 3_800_000, successRate: 90, accountType: "source" },
];

const regions: RegionRow[] = [
  { region: "Tunis", total: 8200, success: 7790, amount: 6_100_000 },
  { region: "Sfax", total: 5400, success: 5020, amount: 4_000_000 },
  { region: "Sousse", total: 4100, success: 3770, amount: 3_050_000 },
];

const canalHourly: CanalHourCell[] = hourly.flatMap((h) =>
  ["voice_mobile_ttcash", "bill_payment", "data_sabba"].map((canal) => ({
    canal,
    hour: h.hour,
    total: Math.round(h.total / 3),
    success: Math.round((h.total / 3) * 0.93),
  })),
);

const meta = {
  title: "Src/Features/Telecom/Components/AnalysisTab",
  component: AnalysisTab,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    operators,
    regions,
    hourly,
    kpi,
    m: mapping,
    // Lazy/group fetchers resolve with realistic data so the Top-50 table fills.
    fetchOperators: async () => operators,
    fetchRegions: async () => regions,
    fetchOperatorsForGroup: async () => operators,
    fetchDestinationsForGroup: async () =>
      operators.map((o) => ({ ...o, accountType: "destination" as const })),
    fetchRegionsForGroup: async () => regions,
    fetchCanalHourlyMatrix: async () => canalHourly,
  },
  argTypes: {
    operators: { control: false },
    regions: { control: false },
    hourly: { control: false },
    kpi: { control: "object" },
    m: { control: false },
    fetchOperators: { control: false },
    fetchRegions: { control: false },
    fetchOperatorsForGroup: { control: false },
    fetchDestinationsForGroup: { control: false },
    fetchRegionsForGroup: { control: false },
    fetchCanalHourlyMatrix: { control: false },
  },
} satisfies Meta<typeof AnalysisTab>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const EmptyTop50: Story = {
  args: {
    fetchOperatorsForGroup: async () => [],
    fetchDestinationsForGroup: async () => [],
    fetchRegionsForGroup: async () => [],
  },
};

export const LowSuccessRate: Story = {
  args: {
    kpi: { ...kpi, successRate: 71.4, avgProcessingMs: 1840 },
  },
};
