import type { Meta, StoryObj } from "@storybook/nextjs";

import DataImportScreen from './DataImportScreen';;

const meta = {
  title: "Src/Features/DataImport/Screens/DataImportScreen",
  component: DataImportScreen,
  tags: ["autodocs"],
} satisfies Meta<typeof DataImportScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
