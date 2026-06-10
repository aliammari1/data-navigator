import type { Meta, StoryObj } from "@storybook/nextjs";
import { fn } from "storybook/test";

import { AIPanel } from "./ai-panel";

const meta = {
  title: "Src/Features/DashboardShell/Components/AiPanel",
  component: AIPanel,
  tags: ["autodocs"],
  args: {
    open: true,
    onClose: fn(),
  },
  argTypes: {
    open: {
      control: "boolean",
    },
    onClose: {
      control: false,
    },
  },
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AIPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Closed: Story = {
  args: {
    open: false,
  },
};
