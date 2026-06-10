import type { Meta, StoryObj } from "@storybook/nextjs";

import AiAnalysisScreen from "./AiAnalysisScreen";

const meta = {
  title: "Src/Features/AiAnalysis/Screens/AiAnalysisScreen",
  component: AiAnalysisScreen,
  tags: ["autodocs"],
} satisfies Meta<typeof AiAnalysisScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
