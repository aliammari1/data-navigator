import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { SuccessGauge } from "@/features/telecom/components/success-gauge";

const meta = {
  title: "Src/Features/Telecom/Components/SuccessGauge",
  component: SuccessGauge,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  args: {
    rate: 96.2,
    size: 80,
  },
  argTypes: {
    rate: { control: { type: "range", min: 0, max: 100, step: 0.1 } },
    size: { control: { type: "range", min: 48, max: 200, step: 4 } },
  },
} satisfies Meta<typeof SuccessGauge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Healthy: Story = {
  args: { rate: 96.2 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("img", { name: /success rate 96\.2%/i })).toBeInTheDocument();
  },
};

export const Warning: Story = {
  args: { rate: 84.5 },
};

export const Critical: Story = {
  args: { rate: 62.1 },
};

export const Large: Story = {
  args: { rate: 96.2, size: 160 },
};
