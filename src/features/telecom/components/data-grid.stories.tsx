import type { Meta, StoryObj } from "@storybook/nextjs";

import { DataGrid } from "./data-grid";

const meta = {
  title: "Src/Features/Telecom/Components/DataGrid",
  component: DataGrid,
  tags: ["autodocs"],
} satisfies Meta<typeof DataGrid>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
