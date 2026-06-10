import type { Meta, StoryObj } from "@storybook/nextjs";

import { Cl3 } from "./cl3";

const meta = {
  title: "Src/Features/Telecom/Components/Cl3",
  component: Cl3,
  tags: ["autodocs"],
} satisfies Meta<typeof Cl3>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
