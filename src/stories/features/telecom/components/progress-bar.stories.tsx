import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { ProgressBar } from "@/features/telecom/components/progress-bar";

const meta = {
  title: "Src/Features/Telecom/Components/ProgressBar",
  component: ProgressBar,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  args: {
    value: 962,
    max: 1000,
    color: "bg-emerald-500",
    showLabel: true,
    height: "h-1.5",
  },
  argTypes: {
    value: { control: { type: "range", min: 0, max: 1000, step: 10 } },
    max: { control: "number" },
    color: { control: "text" },
    showLabel: { control: "boolean" },
    height: {
      control: "inline-radio",
      options: ["h-1", "h-1.5", "h-2", "h-3"],
    },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProgressBar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const High: Story = {
  args: { value: 962, max: 1000, color: "bg-emerald-500" },
};

export const Low: Story = {
  args: { value: 318, max: 1000, color: "bg-red-500" },
};

export const Empty: Story = {
  args: { value: 0, max: 1000 },
};

export const WithoutLabel: Story = {
  args: { showLabel: false },
};

export const ThickBar: Story = {
  args: { height: "h-3", value: 720, max: 1000, color: "bg-indigo-500" },
};
