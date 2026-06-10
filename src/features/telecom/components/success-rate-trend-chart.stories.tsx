import type { Meta, StoryObj } from "@storybook/nextjs";

import { SuccessRateTrendChart } from "./success-rate-trend-chart";

const meta = {
  title: "Src/Features/Telecom/Components/SuccessRateTrendChart",
  component: SuccessRateTrendChart,
  tags: ["autodocs"],
} satisfies Meta<typeof SuccessRateTrendChart>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
