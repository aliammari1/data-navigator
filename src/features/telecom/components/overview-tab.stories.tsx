import type { Meta, StoryObj } from "@storybook/nextjs";

import { OverviewTab } from "./overview-tab";

const meta = {
  title: "Src/Features/Telecom/Components/OverviewTab",
  component: OverviewTab,
  tags: ["autodocs"],
} satisfies Meta<typeof OverviewTab>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
