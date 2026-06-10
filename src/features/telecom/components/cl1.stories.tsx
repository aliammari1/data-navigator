import type { Meta, StoryObj } from "@storybook/nextjs";

import { Cl1 } from "./cl1";

const meta = {
  title: "Src/Features/Telecom/Components/Cl1",
  component: Cl1,
  tags: ["autodocs"],
} satisfies Meta<typeof Cl1>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
