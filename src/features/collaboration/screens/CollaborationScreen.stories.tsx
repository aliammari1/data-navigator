import type { Meta, StoryObj } from "@storybook/nextjs";

import CollaborationScreen from './CollaborationScreen';;

const meta = {
  title: "Src/Features/Collaboration/Screens/CollaborationScreen",
  component: CollaborationScreen,
  tags: ["autodocs"],
} satisfies Meta<typeof CollaborationScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
