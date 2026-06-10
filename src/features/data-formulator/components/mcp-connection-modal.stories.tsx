import type { Meta, StoryObj } from "@storybook/nextjs";

import { McpConnectionModal } from "./mcp-connection-modal";

const meta = {
  title: "Src/Features/DataFormulator/Components/McpConnectionModal",
  component: McpConnectionModal,
  tags: ["autodocs"],
} satisfies Meta<typeof McpConnectionModal>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
