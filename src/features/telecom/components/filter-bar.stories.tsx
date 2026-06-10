import type { Meta, StoryObj } from "@storybook/nextjs";

import { FilterBar } from "./filter-bar";

const meta = {
  title: "Src/Features/Telecom/Components/FilterBar",
  component: FilterBar,
  tags: ["autodocs"],
} satisfies Meta<typeof FilterBar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
