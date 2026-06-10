import type { Meta, StoryObj } from "@storybook/nextjs";

import { ManagerAnswerPanel } from "./manager-answer-panel";

const meta = {
  title: "Src/Features/DataFormulator/Components/ManagerAnswerPanel",
  component: ManagerAnswerPanel,
  tags: ["autodocs"],
} satisfies Meta<typeof ManagerAnswerPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
