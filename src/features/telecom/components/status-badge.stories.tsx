import type { Meta, StoryObj } from "@storybook/nextjs";

import { StatusBadge } from "./status-badge";

const meta = {
  title: "Src/Features/Telecom/Components/StatusBadge",
  component: StatusBadge,
  tags: ["autodocs"],
} satisfies Meta<typeof StatusBadge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
