import type { Meta, StoryObj } from "@storybook/nextjs";

import { HistoryWidgets } from "./history-widgets";

const meta = {
  title: "Src/Features/History/Components/HistoryWidgets",
  component: HistoryWidgets,
  tags: ["autodocs"],
} satisfies Meta<typeof HistoryWidgets>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
