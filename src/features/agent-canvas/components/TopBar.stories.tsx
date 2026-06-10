import type { Meta, StoryObj } from "@storybook/nextjs";

import { TopBar } from "./TopBar";

const meta = {
  title: "Src/Features/AgentCanvas/Components/TopBar",
  component: TopBar,
  tags: ["autodocs"],
} satisfies Meta<typeof TopBar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
