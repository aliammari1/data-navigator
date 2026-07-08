import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { StatusRow } from "@/features/telecom/types";
import { StatusDonut } from "@/features/telecom/components/status-donut";

const data: StatusRow[] = [
  { status: "SUCCESS", count: 23_874, amount: 438_210.5 },
  { status: "DECLINED", count: 612, amount: 11_240.0 },
  { status: "INSTANCE", count: 198, amount: 3_120.0 },
  { status: "REFUND", count: 84, amount: 1_560.75 },
  { status: "SUBMITTED", count: 44, amount: 820.0 },
];

const total = data.reduce((acc, row) => acc + row.count, 0);

const meta = {
  title: "Src/Features/Telecom/Components/StatusDonut",
  component: StatusDonut,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    data,
    total,
  },
  argTypes: {
    data: { control: false },
    total: { control: "number" },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 360, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StatusDonut>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const MostlySuccess: Story = {
  args: {
    data: [
      { status: "SUCCESS", count: 24_700, amount: 451_300 },
      { status: "DECLINED", count: 112, amount: 2_040 },
    ],
    total: 24_812,
  },
};

export const Empty: Story = {
  args: { data: [], total: 0 },
};
