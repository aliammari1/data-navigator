import type { Meta, StoryObj } from "@storybook/nextjs";

import { NarrativePanel } from "./NarrativePanel";

const meta = {
  title: "Src/Features/AgentCanvas/Components/NarrativePanel",
  component: NarrativePanel,
  tags: ["autodocs"],
} satisfies Meta<typeof NarrativePanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
