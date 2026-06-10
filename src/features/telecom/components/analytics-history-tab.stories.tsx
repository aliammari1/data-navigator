import type { Meta, StoryObj } from "@storybook/nextjs";

import { AnalyticsHistoryTab } from "./analytics-history-tab";

const meta = {
  title: "Src/Features/Telecom/Components/AnalyticsHistoryTab",
  component: AnalyticsHistoryTab,
  tags: ["autodocs"],
} satisfies Meta<typeof AnalyticsHistoryTab>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
