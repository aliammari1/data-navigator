import type { Meta, StoryObj } from "@storybook/nextjs";

import { CanalComparePanel } from "./canal-compare-panel";

const meta = {
  title: "Src/Features/Telecom/Components/CanalComparePanel",
  component: CanalComparePanel,
  tags: ["autodocs"],
} satisfies Meta<typeof CanalComparePanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
