import type { Meta, StoryObj } from "@storybook/nextjs";

import { VoiceOutputPlayer } from "./voice-output-player";

const meta = {
  title: "Src/Features/DataFormulator/Components/VoiceOutputPlayer",
  component: VoiceOutputPlayer,
  tags: ["autodocs"],
} satisfies Meta<typeof VoiceOutputPlayer>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
