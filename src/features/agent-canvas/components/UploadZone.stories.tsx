import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";

import { UploadZone } from "./UploadZone";

const meta = {
  title: "Src/Features/AgentCanvas/Components/UploadZone",
  component: UploadZone,
  tags: ["autodocs"],
  args: {
    onLoaded: fn(),
  },
  argTypes: {
    onLoaded: {
      control: false,
    },
  },
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="w-[520px] bg-slate-950 p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof UploadZone>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
