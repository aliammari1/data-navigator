import type { Meta, StoryObj } from "@storybook/nextjs";

import DataTransformScreen from './DataTransformScreen';;

const meta = {
  title: "Src/Features/DataTransform/Screens/DataTransformScreen",
  component: DataTransformScreen,
  tags: ["autodocs"],
} satisfies Meta<typeof DataTransformScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
