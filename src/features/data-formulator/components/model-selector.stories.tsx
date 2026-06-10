import type { Meta, StoryObj } from "@storybook/nextjs";

import { ModelSelector } from "./model-selector";

const meta = {
  title: "Src/Features/DataFormulator/Components/ModelSelector",
  component: ModelSelector,
  tags: ["autodocs"],
} satisfies Meta<typeof ModelSelector>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
