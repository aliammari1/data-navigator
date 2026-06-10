import type { Meta, StoryObj } from "@storybook/nextjs";

import { AgentFlowGraph } from "./AgentFlowGraph";

const meta = {
  title: "Src/Features/AgentCanvas/Components/AgentFlowGraph",
  component: AgentFlowGraph,
  tags: ["autodocs"],
} satisfies Meta<typeof AgentFlowGraph>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
