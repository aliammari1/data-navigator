import type { Meta, StoryObj } from "@storybook/nextjs";

import { AgentStatusPill } from "./agent-status-pill";

const meta = {
  title: "Src/Features/DataFormulator/Components/AgentStatusPill",
  component: AgentStatusPill,
  tags: ["autodocs"],
} satisfies Meta<typeof AgentStatusPill>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
