import type { Meta, StoryObj } from "@storybook/nextjs";

import { Cl2 } from "./cl2";

const meta = {
  title: "Src/Features/Telecom/Components/Cl2",
  component: Cl2,
  tags: ["autodocs"],
} satisfies Meta<typeof Cl2>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
