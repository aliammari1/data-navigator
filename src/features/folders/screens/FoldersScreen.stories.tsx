import type { Meta, StoryObj } from "@storybook/nextjs";

import FoldersScreen from './FoldersScreen';;

const meta = {
  title: "Src/Features/Folders/Screens/FoldersScreen",
  component: FoldersScreen,
  tags: ["autodocs"],
} satisfies Meta<typeof FoldersScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
