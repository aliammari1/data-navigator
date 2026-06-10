import type { Meta, StoryObj } from "@storybook/nextjs";

import { SpecUnitAmountTable } from "./spec-unit-amount-table";

const meta = {
  title: "Src/Features/Telecom/Components/SpecUnitAmountTable",
  component: SpecUnitAmountTable,
  tags: ["autodocs"],
} satisfies Meta<typeof SpecUnitAmountTable>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
