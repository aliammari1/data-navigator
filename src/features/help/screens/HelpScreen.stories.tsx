import type { Meta, StoryObj } from "@storybook/nextjs";

import HelpScreen from './HelpScreen';;

const meta = {
  title: "Src/Features/Help/Screens/HelpScreen",
  component: HelpScreen,
  tags: ["autodocs"],
} satisfies Meta<typeof HelpScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
