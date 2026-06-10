import type { Meta, StoryObj } from "@storybook/nextjs";

import { Canvas } from "./canvas";

const meta = {
  title: "Src/Features/DataFormulator/Components/Canvas",
  component: Canvas,
  tags: ["autodocs"],
} satisfies Meta<typeof Canvas>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
