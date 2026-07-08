import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { AnimCounter } from "@/features/telecom/components/anim-counter";

const meta = {
  title: "Src/Features/Telecom/Components/AnimCounter",
  component: AnimCounter,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  args: {
    value: 24812,
    dec: 0,
  },
  argTypes: {
    value: { control: { type: "number" } },
    dec: { control: { type: "number", min: 0, max: 3 } },
  },
} satisfies Meta<typeof AnimCounter>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const LargeVolume: Story = {
  args: { value: 1_284_507, dec: 0 },
};

export const WithDecimals: Story = {
  args: { value: 1287.456, dec: 3 },
};

export const SuccessRate: Story = {
  args: { value: 94.7, dec: 1 },
};

export const Zero: Story = {
  args: { value: 0, dec: 0 },
};
