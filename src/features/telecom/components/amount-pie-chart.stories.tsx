import type { Meta, StoryObj } from "@storybook/nextjs";

import { AmountPieChart } from "./amount-pie-chart";

const meta = {
  title: "Src/Features/Telecom/Components/AmountPieChart",
  component: AmountPieChart,
  tags: ["autodocs"],
} satisfies Meta<typeof AmountPieChart>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
