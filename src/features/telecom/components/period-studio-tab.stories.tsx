import type { Meta, StoryObj } from "@storybook/nextjs";

import { PeriodStudioTab } from "./period-studio-tab";

const meta = {
  title: "Src/Features/Telecom/Components/PeriodStudioTab",
  component: PeriodStudioTab,
  tags: ["autodocs"],
} satisfies Meta<typeof PeriodStudioTab>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
