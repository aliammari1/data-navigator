import type { Meta, StoryObj } from "@storybook/nextjs";

import ParsedDataScreen from './ParsedDataScreen';;

const meta = {
  title: "Src/Features/ParsedData/Screens/ParsedDataScreen",
  component: ParsedDataScreen,
  tags: ["autodocs"],
} satisfies Meta<typeof ParsedDataScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
