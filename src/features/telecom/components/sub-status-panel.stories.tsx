import type { Meta, StoryObj } from "@storybook/nextjs";

import { SubStatusPanel } from "./sub-status-panel";

const meta = {
  title: "Src/Features/Telecom/Components/SubStatusPanel",
  component: SubStatusPanel,
  tags: ["autodocs"],
} satisfies Meta<typeof SubStatusPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
