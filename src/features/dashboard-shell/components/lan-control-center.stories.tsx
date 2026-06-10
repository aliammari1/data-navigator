import type { Meta, StoryObj } from "@storybook/nextjs";

import { LanControlCenter } from "./lan-control-center";

const meta = {
  title: "Src/Features/DashboardShell/Components/LanControlCenter",
  component: LanControlCenter,
  tags: ["autodocs"],
} satisfies Meta<typeof LanControlCenter>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
