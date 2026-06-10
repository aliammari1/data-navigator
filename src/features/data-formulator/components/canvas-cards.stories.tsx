import type { Meta, StoryObj } from "@storybook/nextjs";

import { CanvasCards } from "./canvas-cards";

const meta = {
  title: "Src/Features/DataFormulator/Components/CanvasCards",
  component: CanvasCards,
  tags: ["autodocs"],
} satisfies Meta<typeof CanvasCards>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
