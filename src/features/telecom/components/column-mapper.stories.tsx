import type { Meta, StoryObj } from "@storybook/nextjs";

import { ColumnMapper } from "./column-mapper";

const meta = {
  title: "Src/Features/Telecom/Components/ColumnMapper",
  component: ColumnMapper,
  tags: ["autodocs"],
} satisfies Meta<typeof ColumnMapper>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
