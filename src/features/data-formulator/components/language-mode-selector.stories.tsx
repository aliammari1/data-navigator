import type { Meta, StoryObj } from "@storybook/nextjs";

import { LanguageModeSelector } from "./language-mode-selector";

const meta = {
  title: "Src/Features/DataFormulator/Components/LanguageModeSelector",
  component: LanguageModeSelector,
  tags: ["autodocs"],
} satisfies Meta<typeof LanguageModeSelector>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
