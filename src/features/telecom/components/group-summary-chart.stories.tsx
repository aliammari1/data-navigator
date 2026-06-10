import type { Meta, StoryObj } from "@storybook/nextjs";

import { GroupSummaryChart } from "./group-summary-chart";

const meta = {
  title: "Src/Features/Telecom/Components/GroupSummaryChart",
  component: GroupSummaryChart,
  tags: ["autodocs"],
} satisfies Meta<typeof GroupSummaryChart>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
