import type { Meta, StoryObj } from "@storybook/nextjs";

import { DataLineagePanel } from "./data-lineage-panel";

const meta = {
  title: "Src/Features/Telecom/Components/DataLineagePanel",
  component: DataLineagePanel,
  tags: ["autodocs"],
} satisfies Meta<typeof DataLineagePanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
