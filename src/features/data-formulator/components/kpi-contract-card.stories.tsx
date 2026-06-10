import type { Meta, StoryObj } from "@storybook/nextjs";

import { KpiContractCard } from "./kpi-contract-card";

const meta = {
  title: "Src/Features/DataFormulator/Components/KpiContractCard",
  component: KpiContractCard,
  tags: ["autodocs"],
} satisfies Meta<typeof KpiContractCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
