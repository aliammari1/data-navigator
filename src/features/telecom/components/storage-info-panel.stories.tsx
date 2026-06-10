import type { Meta, StoryObj } from "@storybook/nextjs";

import { StorageInfoPanel } from "./storage-info-panel";

const meta = {
  title: "Src/Features/Telecom/Components/StorageInfoPanel",
  component: StorageInfoPanel,
  tags: ["autodocs"],
} satisfies Meta<typeof StorageInfoPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
