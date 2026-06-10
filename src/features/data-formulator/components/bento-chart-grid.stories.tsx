import type { Meta, StoryObj } from "@storybook/nextjs";

import { BentoChartGrid } from "./bento-chart-grid";

const meta = {
  title: "Src/Features/DataFormulator/Components/BentoChartGrid",
  component: BentoChartGrid,
  tags: ["autodocs"],
} satisfies Meta<typeof BentoChartGrid>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
