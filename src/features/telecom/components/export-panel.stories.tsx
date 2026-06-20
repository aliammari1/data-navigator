import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { FileText, Smartphone } from "lucide-react";
import { expect, userEvent, within } from "storybook/test";

import type {
  CanalSummary,
  HourlyRow,
  KPISummary,
  OperatorRow,
  OverviewExportSectionKey,
  RegionRow,
  StatusRow,
} from "@/features/telecom/types";
import { ExportPanel } from "./export-panel";

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

const baseCanal: Omit<CanalSummary, "key" | "label" | "icon"> = {
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
};

const canals: CanalSummary[] = [
  { ...baseCanal, key: "bill_payment", label: "Bill Payment", icon: FileText },
  {
    ...baseCanal,
    key: "voice_mobile_ttcash",
    label: "Mobile by TTCASH",
    icon: Smartphone,
    share: 26,
  },
];

const hourly: HourlyRow[] = Array.from({ length: 24 }, (_, hour) => ({
  hour,
  total: 600 + hour * 10,
  success: 560 + hour * 9,
  declined: 40 + hour,
  amount: (600 + hour * 10) * 740,
}));

const operators: OperatorRow[] = [
  {
    operator: "Tunisie Telecom",
    total: 9200,
    success: 8740,
    amount: 6_900_000,
    successRate: 95,
    accountType: "source",
  },
];

const regions: RegionRow[] = [{ region: "Tunis", total: 8200, success: 7790, amount: 6_100_000 }];

const statusData: StatusRow[] = [
  { status: "SUCCESS", count: 23498, amount: 17_400_000 },
  { status: "DECLINED", count: 1014, amount: 720_000 },
];

const selectedKpis = new Set<keyof KPISummary>([
  "totalTransactions",
  "successRate",
  "totalAmount",
  "uniqueCustomers",
]);

const selectedOverviewSections = new Set<OverviewExportSectionKey>([
  "revenueGroups",
  "status",
  "hourly",
  "canalShare",
  "canalTable",
]);

const meta = {
  title: "Src/Features/Telecom/Components/ExportPanel",
  component: ExportPanel,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  args: {
    kpi,
    canals,
    reportDate: "2024-06-01",
    fileName: "transactions_2024-06-01.csv",
    hourly,
    operators,
    regions,
    statusData,
    selectedKpis,
    selectedOverviewSections,
    fetchDailyTrend: async () => [],
  },
  argTypes: {
    kpi: { control: false },
    canals: { control: false },
    hourly: { control: false },
    operators: { control: false },
    regions: { control: false },
    statusData: { control: false },
    selectedKpis: { control: false },
    selectedOverviewSections: { control: false },
    fetchDailyTrend: { control: false },
    reportDate: { control: "text" },
    fileName: { control: "text" },
  },
} satisfies Meta<typeof ExportPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * Clicking the trigger opens the export menu with format options.
 */
export const OpensMenu: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Exporter/i }));
    await expect(canvas.getByText(/Exporter le rapport/i)).toBeInTheDocument();
  },
};

export const NoKpiData: Story = {
  args: {
    kpi: null,
  },
};
