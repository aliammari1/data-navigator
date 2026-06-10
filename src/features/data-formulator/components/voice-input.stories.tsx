import type { Meta, StoryObj } from "@storybook/nextjs";

import { VoiceInput } from "./voice-input";

const meta = {
  title: "Src/Features/DataFormulator/Components/VoiceInput",
  component: VoiceInput,
  tags: ["autodocs"],
} satisfies Meta<typeof VoiceInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
