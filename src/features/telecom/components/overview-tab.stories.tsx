import type { Meta, StoryObj } from "@storybook/nextjs";
import { CreditCard, Phone, Wifi } from "lucide-react";
import { fn } from "storybook/test";

import type {
  CanalSummary,
  ColumnMapping,
  DailyTrendRow,
  HourlyRow,
  KPISummary,
  OverviewExportSectionKey,
  StatusRow,
} from "@/features/telecom/types";
import { OverviewTab } from "./overview-tab";

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

const kpi: KPISummary = {
  totalTransactions: 24_812,
  successCount: 23_874,
  declinedCount: 612,
  refundCount: 84,
  instanceCount: 198,
  submittedCount: 44,
  successRate: 96.2,
  totalAmount: 451_300.5,
  avgAmount: 18.4,
  avgProcessingMs: 320,
  uniqueCustomers: 8_412,
  peakHour: 12,
  topErrorCode: "51",
};

const canals: CanalSummary[] = [
  {
    key: "bill_payment",
    label: "Paiement facture",
    icon: CreditCard,
    color: "text-indigo-500",
    bgColor: "bg-indigo-500/10",
    borderColor: "border-indigo-500/20",
    total: 12_400,
    success: 11_980,
    declined: 320,
    refund: 60,
    instance: 30,
    submitted: 10,
    amount: 248_100.5,
    successRate: 96.6,
    avgAmount: 20.0,
    share: 0.5,
  },
  {
    key: "voice_mobile_ttcash",
    label: "Recharge mobile TTcash",
    icon: Phone,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
    total: 8_100,
    success: 7_540,
    declined: 480,
    refund: 50,
    instance: 20,
    submitted: 10,
    amount: 121_500.0,
    successRate: 93.1,
    avgAmount: 15.0,
    share: 0.33,
  },
  {
    key: "data_sabba",
    label: "Data Sabba",
    icon: Wifi,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
    total: 4_300,
    success: 3_650,
    declined: 600,
    refund: 30,
    instance: 15,
    submitted: 5,
    amount: 64_500.0,
    successRate: 84.9,
    avgAmount: 15.0,
    share: 0.17,
  },
];

const hourly: HourlyRow[] = Array.from({ length: 24 }, (_, hour) => {
  const total = Math.max(60, Math.round(400 + 900 * Math.sin((hour / 24) * Math.PI)));
  const declined = Math.round(total * 0.04);
  return { hour, total, success: total - declined, declined, amount: total * 18.4 };
});

const statusData: StatusRow[] = [
  { status: "SUCCESS", count: 23_874, amount: 438_210.5 },
  { status: "DECLINED", count: 612, amount: 11_240.0 },
  { status: "INSTANCE", count: 198, amount: 3_120.0 },
  { status: "REFUND", count: 84, amount: 1_560.75 },
  { status: "SUBMITTED", count: 44, amount: 820.0 },
];

const dailyTrend: DailyTrendRow[] = Array.from({ length: 7 }, (_, i) => {
  const day = `2024-06-0${i + 1}`;
  const total = 22_000 + i * 450;
  const declined = Math.round(total * 0.04);
  return { day, total, success: total - declined, declined, amount: total * 18.4 };
});

const allSections: OverviewExportSectionKey[] = [
  "assistant",
  "revenueGroups",
  "status",
  "hourly",
  "canalShare",
  "canalAmount",
  "successRate",
  "canalTable",
  "dailyTrend",
];

const meta = {
  title: "Src/Features/Telecom/Components/OverviewTab",
  component: OverviewTab,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    kpi,
    canals,
    hourly,
    statusData,
    forecast: [],
    m: mapping,
    selectedKpis: new Set([
      "totalTransactions",
      "successCount",
      "declinedCount",
    ]) as Set<keyof KPISummary>,
    toggleKpi: fn(),
    selectedOverviewSections: new Set(allSections),
    toggleOverviewSection: fn(),
    fetchDailyTrend: async () => dailyTrend,
  },
  argTypes: {
    kpi: { control: false },
    canals: { control: false },
    hourly: { control: false },
    statusData: { control: false },
    forecast: { control: false },
    m: { control: false },
    selectedKpis: { control: false },
    selectedOverviewSections: { control: false },
    toggleKpi: { control: false },
    toggleOverviewSection: { control: false },
    fetchDailyTrend: { control: false },
  },
  decorators: [
    (Story) => (
      <div style={{ padding: 16 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OverviewTab>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loading: Story = {
  args: {
    kpi: null,
    canals: [],
    statusData: [],
  },
};
