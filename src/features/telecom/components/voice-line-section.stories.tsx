import type { Meta, StoryObj } from "@storybook/nextjs";

import { VoiceLineSection } from "./voice-line-section";

const meta = {
  title: "Src/Features/Telecom/Components/VoiceLineSection",
  component: VoiceLineSection,
  tags: ["autodocs"],
} satisfies Meta<typeof VoiceLineSection>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
