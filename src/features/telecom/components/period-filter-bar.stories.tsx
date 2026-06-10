import type { Meta, StoryObj } from "@storybook/nextjs";

import { PeriodFilterBar } from "./period-filter-bar";

const meta = {
  title: "Src/Features/Telecom/Components/PeriodFilterBar",
  component: PeriodFilterBar,
  tags: ["autodocs"],
} satisfies Meta<typeof PeriodFilterBar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
