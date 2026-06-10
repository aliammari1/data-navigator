import type { Meta, StoryObj } from "@storybook/nextjs";

import { AiAgentPanel } from "./ai-agent-panel";

const meta = {
  title: "Src/Features/Telecom/Components/AiAgentPanel",
  component: AiAgentPanel,
  tags: ["autodocs"],
} satisfies Meta<typeof AiAgentPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
