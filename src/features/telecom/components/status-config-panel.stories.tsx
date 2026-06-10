import type { Meta, StoryObj } from "@storybook/nextjs";

import { StatusConfigPanel } from "./status-config-panel";

const meta = {
  title: "Src/Features/Telecom/Components/StatusConfigPanel",
  component: StatusConfigPanel,
  tags: ["autodocs"],
} satisfies Meta<typeof StatusConfigPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
