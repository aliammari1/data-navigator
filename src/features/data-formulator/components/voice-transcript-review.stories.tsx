import type { Meta, StoryObj } from "@storybook/nextjs";

import { VoiceTranscriptReview } from "./voice-transcript-review";

const meta = {
  title: "Src/Features/DataFormulator/Components/VoiceTranscriptReview",
  component: VoiceTranscriptReview,
  tags: ["autodocs"],
} satisfies Meta<typeof VoiceTranscriptReview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
