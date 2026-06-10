import type { Meta, StoryObj } from "@storybook/nextjs";

import { AnimCounter } from "./anim-counter";

const meta = {
  title: "Src/Features/Telecom/Components/AnimCounter",
  component: AnimCounter,
  tags: ["autodocs"],
} satisfies Meta<typeof AnimCounter>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
