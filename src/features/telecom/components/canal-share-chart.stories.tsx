import type { Meta, StoryObj } from "@storybook/nextjs";

import { CanalShareChart } from "./canal-share-chart";

const meta = {
  title: "Src/Features/Telecom/Components/CanalShareChart",
  component: CanalShareChart,
  tags: ["autodocs"],
} satisfies Meta<typeof CanalShareChart>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
