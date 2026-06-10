import type { Meta, StoryObj } from "@storybook/nextjs";

import { CommandBar } from "./command-bar";

const meta = {
  title: "Src/Features/DataFormulator/Components/CommandBar",
  component: CommandBar,
  tags: ["autodocs"],
} satisfies Meta<typeof CommandBar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
