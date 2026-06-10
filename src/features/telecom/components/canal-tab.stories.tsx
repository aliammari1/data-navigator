import type { Meta, StoryObj } from "@storybook/nextjs";

import { CanalTab } from "./canal-tab";

const meta = {
  title: "Src/Features/Telecom/Components/CanalTab",
  component: CanalTab,
  tags: ["autodocs"],
} satisfies Meta<typeof CanalTab>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
