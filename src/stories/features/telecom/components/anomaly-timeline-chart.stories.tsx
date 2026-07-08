import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { HourlyRow } from "@/features/telecom/types";
import { AnomalyTimelineChart } from "@/features/telecom/components/anomaly-timeline-chart";

const hourly: HourlyRow[] = Array.from({ length: 24 }, (_, hour) => {
  const base = 400 + Math.round(900 * Math.sin((hour / 24) * Math.PI));
  return {
    hour,
    total: base,
    success: Math.round(base * 0.94),
    declined: Math.round(base * 0.06),
    amount: base * 740,
  };
});

// Inject an obvious spike at 13h and a drop at 3h to match the anomalies below.
hourly[13] = { hour: 13, total: 3200, success: 2100, declined: 1100, amount: 2_368_000 };
hourly[3] = { hour: 3, total: 40, success: 20, declined: 20, amount: 29_600 };

const anomalies: Array<{ hour: number; zScore: number; type: "spike" | "drop" }> = [
  { hour: 13, zScore: 4.2, type: "spike" },
  { hour: 3, zScore: 3.1, type: "drop" },
];

const meta = {
  title: "Src/Features/Telecom/Components/AnomalyTimelineChart",
  component: AnomalyTimelineChart,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  args: {
    hourly,
    anomalies,
  },
  argTypes: {
    hourly: { control: "object" },
    anomalies: { control: "object" },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 640 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AnomalyTimelineChart>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoAnomalies: Story = {
  args: { anomalies: [] },
};

export const SpikeOnly: Story = {
  args: {
    anomalies: [{ hour: 13, zScore: 4.2, type: "spike" }],
  },
};
