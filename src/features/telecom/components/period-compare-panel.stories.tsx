import type { Meta, StoryObj } from "@storybook/nextjs";

import { PeriodComparePanel } from "./period-compare-panel";

const meta = {
  title: "Src/Features/Telecom/Components/PeriodComparePanel",
  component: PeriodComparePanel,
  tags: ["autodocs"],
} satisfies Meta<typeof PeriodComparePanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
