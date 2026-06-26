import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { ChannelDef } from "@/features/telecom/lib/report-engine";
import type { SpecStatusResult } from "@/features/telecom/types";
import { SpecStatusTable } from "@/features/telecom/components/spec-status-table";

const channels: ChannelDef[] = [
  { name: "IZIPAY", condition: "BRAND_D = 39" },
  { name: "SMT", condition: "BRAND_D = 12" },
];

const result: SpecStatusResult = {
  rows: [
    { status: "SUCCESS", nombre: 23_874 },
    { status: "DECLINED", nombre: 612 },
    { status: "INSTANCE", nombre: 198 },
    { status: "REFUND", nombre: 84 },
  ],
  total: { status: "TOTAL", nombre: 24_768 },
};

const meta = {
  title: "Src/Features/Telecom/Components/SpecStatusTable",
  component: SpecStatusTable,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    channels,
    dateFrom: "2024-06-01",
    dateTo: "2024-06-01",
    fetchSpecStatusStats: async () => result,
  },
  argTypes: {
    channels: { control: false },
    fetchSpecStatusStats: { control: false },
    dateFrom: { control: "text" },
    dateTo: { control: "text" },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 480, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SpecStatusTable>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: {
    fetchSpecStatusStats: async () => ({
      rows: [],
      total: { status: "TOTAL", nombre: 0 },
    }),
  },
};

export const Loading: Story = {
  args: {
    fetchSpecStatusStats: () => new Promise(() => {}),
  },
};
