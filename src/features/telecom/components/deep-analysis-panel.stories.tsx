import type { Meta, StoryObj } from "@storybook/nextjs";

import { DeepAnalysisPanel } from "./deep-analysis-panel";

const meta = {
  title: "Src/Features/Telecom/Components/DeepAnalysisPanel",
  component: DeepAnalysisPanel,
  tags: ["autodocs"],
} satisfies Meta<typeof DeepAnalysisPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
