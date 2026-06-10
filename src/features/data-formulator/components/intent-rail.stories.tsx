import type { Meta, StoryObj } from "@storybook/nextjs";

import { IntentRail } from "./intent-rail";

const meta = {
  title: "Src/Features/DataFormulator/Components/IntentRail",
  component: IntentRail,
  tags: ["autodocs"],
} satisfies Meta<typeof IntentRail>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
