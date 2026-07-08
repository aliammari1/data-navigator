import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import { MODEL_CATALOG } from "@/features/agent-canvas/core/types";
import { SetupScreen } from "@/features/agent-canvas/components/SetupScreen";

const meta = {
  title: "Src/Features/AgentCanvas/Components/SetupScreen",
  component: SetupScreen,
  tags: ["autodocs"],
  args: {
    model: MODEL_CATALOG[0].id,
    onReady: fn(),
    onModelChange: fn(),
  },
  argTypes: {
    model: {
      control: "select",
      options: MODEL_CATALOG.map((model) => model.id),
    },
    onReady: {
      control: false,
    },
    onModelChange: {
      control: false,
    },
  },
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof SetupScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Interactive: Story = {
  render: (args) => {
    const [model, setModel] = useState(args.model);

    return (
      <SetupScreen
        {...args}
        model={model}
        onModelChange={(id) => {
          setModel(id);
          args.onModelChange(id);
        }}
      />
    );
  },
};
