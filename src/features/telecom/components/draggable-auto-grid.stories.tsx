import type { Meta, StoryObj } from "@storybook/nextjs";

import { DraggableAutoGrid } from "./draggable-auto-grid";

const meta = {
  title: "Src/Features/Telecom/Components/DraggableAutoGrid",
  component: DraggableAutoGrid,
  tags: ["autodocs"],
} satisfies Meta<typeof DraggableAutoGrid>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
