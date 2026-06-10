import type { Meta, StoryObj } from "@storybook/nextjs";

import { AgentTraceVisualizer } from "./agent-trace-visualizer";

const meta = {
  title: "Src/Features/DataFormulator/Components/AgentTraceVisualizer",
  component: AgentTraceVisualizer,
  tags: ["autodocs"],
} satisfies Meta<typeof AgentTraceVisualizer>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
