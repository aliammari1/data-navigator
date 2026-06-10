import type { Meta, StoryObj } from "@storybook/nextjs";

import { ProgressBar } from "./progress-bar";

const meta = {
  title: "Src/Features/Telecom/Components/ProgressBar",
  component: ProgressBar,
  tags: ["autodocs"],
} satisfies Meta<typeof ProgressBar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
