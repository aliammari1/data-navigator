import type { Meta, StoryObj } from "@storybook/nextjs";

import { VoiceDebugPanel } from "./voice-debug-panel";

const meta = {
  title: "Src/Features/DataFormulator/Components/VoiceDebugPanel",
  component: VoiceDebugPanel,
  tags: ["autodocs"],
} satisfies Meta<typeof VoiceDebugPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
