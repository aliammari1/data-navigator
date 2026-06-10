import type { Meta, StoryObj } from "@storybook/nextjs";

import { LanStatusDock } from "./lan-status-dock";

const meta = {
  title: "Src/Features/DashboardShell/Components/LanStatusDock",
  component: LanStatusDock,
  tags: ["autodocs"],
} satisfies Meta<typeof LanStatusDock>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
