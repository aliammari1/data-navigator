import type { Meta, StoryObj } from "@storybook/nextjs";

import SettingsScreen from './SettingsScreen';;

const meta = {
  title: "Src/Features/Settings/Screens/SettingsScreen",
  component: SettingsScreen,
  tags: ["autodocs"],
} satisfies Meta<typeof SettingsScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
