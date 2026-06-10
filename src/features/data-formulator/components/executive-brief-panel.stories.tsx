import type { Meta, StoryObj } from "@storybook/nextjs";

import { ExecutiveBriefPanel } from "./executive-brief-panel";

const meta = {
  title: "Src/Features/DataFormulator/Components/ExecutiveBriefPanel",
  component: ExecutiveBriefPanel,
  tags: ["autodocs"],
} satisfies Meta<typeof ExecutiveBriefPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
