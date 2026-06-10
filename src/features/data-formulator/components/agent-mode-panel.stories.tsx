import type { Meta, StoryObj } from "@storybook/nextjs";

import { AgentModePanel } from "./agent-mode-panel";

const meta = {
  title: "Src/Features/DataFormulator/Components/AgentModePanel",
  component: AgentModePanel,
  tags: ["autodocs"],
} satisfies Meta<typeof AgentModePanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
