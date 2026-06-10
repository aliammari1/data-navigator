import type { Meta, StoryObj } from "@storybook/nextjs";

import { AnomalyTimelineChart } from "./anomaly-timeline-chart";

const meta = {
  title: "Src/Features/Telecom/Components/AnomalyTimelineChart",
  component: AnomalyTimelineChart,
  tags: ["autodocs"],
} satisfies Meta<typeof AnomalyTimelineChart>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
