import type { Meta, StoryObj } from "@storybook/nextjs";

import { DailyTrendChart } from "./daily-trend-chart";

const meta = {
  title: "Src/Features/Telecom/Components/DailyTrendChart",
  component: DailyTrendChart,
  tags: ["autodocs"],
} satisfies Meta<typeof DailyTrendChart>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
