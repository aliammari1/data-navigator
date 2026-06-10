import type { Meta, StoryObj } from "@storybook/nextjs";

import { SpecStatusTable } from "./spec-status-table";

const meta = {
  title: "Src/Features/Telecom/Components/SpecStatusTable",
  component: SpecStatusTable,
  tags: ["autodocs"],
} satisfies Meta<typeof SpecStatusTable>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
