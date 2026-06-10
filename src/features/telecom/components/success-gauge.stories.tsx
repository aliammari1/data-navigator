import type { Meta, StoryObj } from "@storybook/nextjs";

import { SuccessGauge } from "./success-gauge";

const meta = {
  title: "Src/Features/Telecom/Components/SuccessGauge",
  component: SuccessGauge,
  tags: ["autodocs"],
} satisfies Meta<typeof SuccessGauge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
