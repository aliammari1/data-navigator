import type { Meta, StoryObj } from "@storybook/nextjs";

import HistoryScreen from './HistoryScreen';;

const meta = {
  title: "Src/Features/History/Screens/HistoryScreen",
  component: HistoryScreen,
  tags: ["autodocs"],
} satisfies Meta<typeof HistoryScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
