import type { Meta, StoryObj } from "@storybook/nextjs";

import { KpiFoundryPanel } from "./kpi-foundry-panel";

const meta = {
  title: "Src/Features/DataFormulator/Components/KpiFoundryPanel",
  component: KpiFoundryPanel,
  tags: ["autodocs"],
} satisfies Meta<typeof KpiFoundryPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
