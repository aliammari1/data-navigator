import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { HourlyRow } from "../types";
import { HourlyChart } from "./hourly-chart";

const data: HourlyRow[] = Array.from({ length: 24 }, (_, hour) => {
  const base = Math.round(400 + 900 * Math.sin((hour / 24) * Math.PI));
  const total = Math.max(60, base);
  const declined = Math.round(total * 0.04);
  return {
    hour,
    total,
    success: total - declined,
    declined,
    amount: total * 18.4,
  };
});

const meta = {
  title: "Src/Features/Telecom/Components/HourlyChart",
  component: HourlyChart,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    data,
    forecast: [],
  },
  argTypes: {
    data: { control: false },
    forecast: { control: false },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 640, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HourlyChart>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithForecast: Story = {
  args: {
    forecast: [
      { hour: 24, predictedTotal: 920, predictedSuccessRate: 0.95, isForecast: true },
      { hour: 25, predictedTotal: 880, predictedSuccessRate: 0.94, isForecast: true },
      { hour: 26, predictedTotal: 640, predictedSuccessRate: 0.93, isForecast: true },
    ],
  },
};

export const Empty: Story = {
  args: { data: [] },
};
