import type { Meta, StoryObj } from "@storybook/nextjs";

import { DataFormulatorScreen } from "./DataFormulatorScreen";

const meta = {
  title: "Src/Features/DataFormulator/Screens/DataFormulatorScreen",
  component: DataFormulatorScreen,
  tags: ["autodocs"],
} satisfies Meta<typeof DataFormulatorScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
