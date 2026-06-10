import type { Meta, StoryObj } from "@storybook/nextjs";

import { DayAnalyticsTab } from "./day-analytics-tab";

const meta = {
  title: "Src/Features/Telecom/Components/DayAnalyticsTab",
  component: DayAnalyticsTab,
  tags: ["autodocs"],
} satisfies Meta<typeof DayAnalyticsTab>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
