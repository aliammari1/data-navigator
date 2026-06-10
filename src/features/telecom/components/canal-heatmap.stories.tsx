import type { Meta, StoryObj } from "@storybook/nextjs";

import { CanalHeatmap } from "./canal-heatmap";

const meta = {
  title: "Src/Features/Telecom/Components/CanalHeatmap",
  component: CanalHeatmap,
  tags: ["autodocs"],
} satisfies Meta<typeof CanalHeatmap>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
