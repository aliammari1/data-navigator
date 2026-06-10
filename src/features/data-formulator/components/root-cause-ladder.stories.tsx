import type { Meta, StoryObj } from "@storybook/nextjs";

import { RootCauseLadder } from "./root-cause-ladder";

const meta = {
  title: "Src/Features/DataFormulator/Components/RootCauseLadder",
  component: RootCauseLadder,
  tags: ["autodocs"],
} satisfies Meta<typeof RootCauseLadder>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
