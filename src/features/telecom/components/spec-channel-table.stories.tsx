import type { Meta, StoryObj } from "@storybook/nextjs";

import { SpecChannelTable } from "./spec-channel-table";

const meta = {
  title: "Src/Features/Telecom/Components/SpecChannelTable",
  component: SpecChannelTable,
  tags: ["autodocs"],
} satisfies Meta<typeof SpecChannelTable>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
