import type { Meta, StoryObj } from "@storybook/nextjs";

import { KpiCard } from "./kpi-card";

const meta = {
  title: "Src/Features/Telecom/Components/KpiCard",
  component: KpiCard,
  tags: ["autodocs"],
} satisfies Meta<typeof KpiCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
