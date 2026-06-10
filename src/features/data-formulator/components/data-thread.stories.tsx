import type { Meta, StoryObj } from "@storybook/nextjs";

import { DataThread } from "./data-thread";

const meta = {
  title: "Src/Features/DataFormulator/Components/DataThread",
  component: DataThread,
  tags: ["autodocs"],
} satisfies Meta<typeof DataThread>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
