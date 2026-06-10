import type { Meta, StoryObj } from "@storybook/nextjs";

import { CanalDetectorPanel } from "./canal-detector-panel";

const meta = {
  title: "Src/Features/Telecom/Components/CanalDetectorPanel",
  component: CanalDetectorPanel,
  tags: ["autodocs"],
} satisfies Meta<typeof CanalDetectorPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
