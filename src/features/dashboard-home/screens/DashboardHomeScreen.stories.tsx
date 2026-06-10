import type { Meta, StoryObj } from "@storybook/nextjs";

import DashboardHomeScreen from './DashboardHomeScreen';;

const meta = {
  title: "Src/Features/DashboardHome/Screens/DashboardHomeScreen",
  component: DashboardHomeScreen,
  tags: ["autodocs"],
} satisfies Meta<typeof DashboardHomeScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
