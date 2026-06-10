import type { Meta, StoryObj } from "@storybook/nextjs";

import { ExplainabilityPanel } from "./explainability-panel";

const meta = {
  title: "Src/Features/DataFormulator/Components/ExplainabilityPanel",
  component: ExplainabilityPanel,
  tags: ["autodocs"],
} satisfies Meta<typeof ExplainabilityPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
