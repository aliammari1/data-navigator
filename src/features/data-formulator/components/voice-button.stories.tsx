import type { Meta, StoryObj } from "@storybook/nextjs";

import { VoiceButton } from "./voice-button";

const meta = {
  title: "Src/Features/DataFormulator/Components/VoiceButton",
  component: VoiceButton,
  tags: ["autodocs"],
} satisfies Meta<typeof VoiceButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
