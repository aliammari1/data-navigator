import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";

import { ModelPicker } from "@/features/agent-canvas/components/ModelPicker";

const meta = {
  title: "Src/Features/AgentCanvas/Components/ModelPicker",
  component: ModelPicker,
  tags: ["autodocs"],
  args: {
    onLoaded: fn(),
    onSkip: fn(),
  },
  argTypes: {
    onLoaded: {
      control: false,
    },
    onSkip: {
      control: false,
    },
  },
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen w-[720px] bg-slate-950 p-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ModelPicker>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
