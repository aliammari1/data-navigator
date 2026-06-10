import type { Meta, StoryObj } from "@storybook/nextjs";

import { ScenarioSimulator } from "./scenario-simulator";

const meta = {
  title: "Src/Features/DataFormulator/Components/ScenarioSimulator",
  component: ScenarioSimulator,
  tags: ["autodocs"],
} satisfies Meta<typeof ScenarioSimulator>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
