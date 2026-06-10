import type { Meta, StoryObj } from "@storybook/nextjs";

import { CustomKpiBuilder } from "./custom-kpi-builder";

const meta = {
  title: "Src/Features/Telecom/Components/CustomKpiBuilder",
  component: CustomKpiBuilder,
  tags: ["autodocs"],
} satisfies Meta<typeof CustomKpiBuilder>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
