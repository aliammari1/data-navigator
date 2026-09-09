import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SpecUnitAmountTable } from "@/features/telecom/components/spec-unit-amount-table";
import type { ChannelDef } from "@/features/telecom/lib/report-engine";
import type { SpecUnitAmountResult } from "@/features/telecom/types";

const channels: ChannelDef[] = [
  { name: "IZIPAY", condition: "BRAND_D = 39" },
  { name: "SMT", condition: "BRAND_D = 12" },
];

const result: SpecUnitAmountResult = {
  rows: [
    { unitAmount: "5 DT", nombre: 9_120, montant: 45_600 },
    { unitAmount: "10 DT", nombre: 7_400, montant: 74_000 },
    { unitAmount: "20 DT", nombre: 5_200, montant: 104_000 },
    { unitAmount: "50 DT", nombre: 2_100, montant: 105_000 },
  ],
  total: { unitAmount: "TOTAL", nombre: 23_820, montant: 328_600 },
};

const meta = {
  title: "Src/Features/Telecom/Components/SpecUnitAmountTable",
  component: SpecUnitAmountTable,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    channels,
    dateFrom: "2024-06-01",
    dateTo: "2024-06-01",
    fetchSpecUnitAmountStats: async () => result,
  },
  argTypes: {
    channels: { control: false },
    fetchSpecUnitAmountStats: { control: false },
    dateFrom: { control: "text" },
    dateTo: { control: "text" },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 560, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SpecUnitAmountTable>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: {
    fetchSpecUnitAmountStats: async () => ({
      rows: [],
      total: { unitAmount: "TOTAL", nombre: 0, montant: 0 },
    }),
  },
};

export const Loading: Story = {
  args: {
    fetchSpecUnitAmountStats: () => new Promise(() => {}),
  },
};
