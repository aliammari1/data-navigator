import type { Meta, StoryObj } from "@storybook/nextjs";

import { InspectorPanel } from "./inspector-panel";

const meta = {
  title: "Src/Features/DataFormulator/Components/InspectorPanel",
  component: InspectorPanel,
  tags: ["autodocs"],
} satisfies Meta<typeof InspectorPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
