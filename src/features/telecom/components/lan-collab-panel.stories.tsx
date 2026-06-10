import type { Meta, StoryObj } from "@storybook/nextjs";

import { LanCollabPanel } from "./lan-collab-panel";

const meta = {
  title: "Src/Features/Telecom/Components/LanCollabPanel",
  component: LanCollabPanel,
  tags: ["autodocs"],
} satisfies Meta<typeof LanCollabPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
