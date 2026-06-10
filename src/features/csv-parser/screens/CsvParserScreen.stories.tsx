import type { Meta, StoryObj } from "@storybook/nextjs";

import CsvParserScreen from './CsvParserScreen';;

const meta = {
  title: "Src/Features/CsvParser/Screens/CsvParserScreen",
  component: CsvParserScreen,
  tags: ["autodocs"],
} satisfies Meta<typeof CsvParserScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
