import type { Meta, StoryObj } from "@storybook/nextjs";

import AgentCanvasScreen from "./AgentCanvasScreen";

const meta = {
  title: "Src/Features/AgentCanvas/Screens/AgentCanvasScreen",
  component: AgentCanvasScreen,
  tags: ["autodocs"],
} satisfies Meta<typeof AgentCanvasScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
