import type { Meta, StoryObj } from "@storybook/nextjs";

import { AnalysisTab } from "./analysis-tab";

const meta = {
  title: "Src/Features/Telecom/Components/AnalysisTab",
  component: AnalysisTab,
  tags: ["autodocs"],
} satisfies Meta<typeof AnalysisTab>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
