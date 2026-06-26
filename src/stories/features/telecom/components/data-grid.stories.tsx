import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within } from "storybook/test";

import type { ColumnMapping, FilterState, RawRow, StatusMapping } from "@/features/telecom/types";
import { DataGrid } from "@/features/telecom/components/data-grid";

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

const filters: FilterState = {
  status: "",
  canal: "",
  region: "",
  operator: "",
  search: "",
  minAmount: "",
  maxAmount: "",
  hourFrom: "",
  hourTo: "",
};

const statusMapping: StatusMapping[] = [
  {
    rawCode: "OK",
    label: "Succès",
    semantic: "success",
    color: "#a6e3a1",
    badgeClass: "bg-emerald-50 text-emerald-700",
  },
  {
    rawCode: "DC01",
    label: "Refusé",
    semantic: "declined",
    color: "#f38ba8",
    badgeClass: "bg-red-50 text-red-700",
  },
];

const rows: RawRow[] = Array.from({ length: 12 }, (_, i) => ({
  transaction_date: `2024-06-01 ${String(8 + i).padStart(2, "0")}:30`,
  msisdn: `2169${String(1000000 + i)}`,
  canal: i % 2 === 0 ? "Mobile by TTCASH" : "Bill Payment",
  service_name: "Recharge mobile",
  amount: 500 + i * 25,
  status: i % 4 === 0 ? "DC01" : "OK",
  error_code: i % 4 === 0 ? "INSUFFICIENT_BALANCE" : "",
  operator: "Tunisie Telecom",
  region: "Tunis",
}));

const fetchFiltered = fn(async () => ({ rows, total: rows.length }));

const meta = {
  title: "Src/Features/Telecom/Components/DataGrid",
  component: DataGrid,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: {
    m: mapping,
    filters,
    statusMapping,
    onMsisdnClick: fn(),
    fetchFiltered,
  },
  argTypes: {
    m: { control: false },
    filters: { control: false },
    statusMapping: { control: false },
    onMsisdnClick: { control: false },
    fetchFiltered: { control: false },
  },
} satisfies Meta<typeof DataGrid>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/lignes correspondant aux filtres/i)).toBeInTheDocument();
  },
};

export const Empty: Story = {
  args: {
    fetchFiltered: fn(async () => ({ rows: [], total: 0 })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(/Aucun résultat correspondant aux filtres/i),
    ).toBeInTheDocument();
  },
};

export const FilteredBySearch: Story = {
  args: {
    filters: { ...filters, search: "21691000003" },
  },
};
