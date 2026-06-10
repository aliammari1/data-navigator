import type { Meta, StoryObj } from "@storybook/nextjs";

import DataBrowserScreen from './DataBrowserScreen';;

const meta = {
  title: "Src/Features/DataBrowser/Screens/DataBrowserScreen",
  component: DataBrowserScreen,
  tags: ["autodocs"],
} satisfies Meta<typeof DataBrowserScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
