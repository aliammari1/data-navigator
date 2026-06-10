import type { Meta, StoryObj } from "@storybook/nextjs";

import { AiInsightsPanel } from "./ai-insights-panel";

const meta = {
  title: "Src/Features/Telecom/Components/AiInsightsPanel",
  component: AiInsightsPanel,
  tags: ["autodocs"],
} satisfies Meta<typeof AiInsightsPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
