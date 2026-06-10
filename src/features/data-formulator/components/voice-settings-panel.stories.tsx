import type { Meta, StoryObj } from "@storybook/nextjs";

import { VoiceSettingsPanel } from "./voice-settings-panel";

const meta = {
  title: "Src/Features/DataFormulator/Components/VoiceSettingsPanel",
  component: VoiceSettingsPanel,
  tags: ["autodocs"],
} satisfies Meta<typeof VoiceSettingsPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
