import type { Meta, StoryObj } from "@storybook/nextjs";

import { RiskScoreChart } from "./risk-score-chart";

const meta = {
  title: "Src/Features/Telecom/Components/RiskScoreChart",
  component: RiskScoreChart,
  tags: ["autodocs"],
} satisfies Meta<typeof RiskScoreChart>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
