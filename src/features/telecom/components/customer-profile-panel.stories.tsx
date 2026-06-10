import type { Meta, StoryObj } from "@storybook/nextjs";

import { CustomerProfilePanel } from "./customer-profile-panel";

const meta = {
  title: "Src/Features/Telecom/Components/CustomerProfilePanel",
  component: CustomerProfilePanel,
  tags: ["autodocs"],
} satisfies Meta<typeof CustomerProfilePanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
