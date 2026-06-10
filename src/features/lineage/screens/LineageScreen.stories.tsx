import type { Meta, StoryObj } from "@storybook/nextjs";

import LineageScreen from './LineageScreen';;

const meta = {
  title: "Src/Features/Lineage/Screens/LineageScreen",
  component: LineageScreen,
  tags: ["autodocs"],
} satisfies Meta<typeof LineageScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
