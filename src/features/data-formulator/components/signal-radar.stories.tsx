import type { Meta, StoryObj } from "@storybook/nextjs";

import { SignalRadar } from "./signal-radar";

const meta = {
  title: "Src/Features/DataFormulator/Components/SignalRadar",
  component: SignalRadar,
  tags: ["autodocs"],
} satisfies Meta<typeof SignalRadar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
