import type { Meta, StoryObj } from "@storybook/nextjs";

import { VoiceToolPreview } from "./voice-tool-preview";

const meta = {
  title: "Src/Features/DataFormulator/Components/VoiceToolPreview",
  component: VoiceToolPreview,
  tags: ["autodocs"],
} satisfies Meta<typeof VoiceToolPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
