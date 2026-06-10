import type { Meta, StoryObj } from "@storybook/nextjs";

import { HourlyChart } from "./hourly-chart";

const meta = {
  title: "Src/Features/Telecom/Components/HourlyChart",
  component: HourlyChart,
  tags: ["autodocs"],
} satisfies Meta<typeof HourlyChart>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
