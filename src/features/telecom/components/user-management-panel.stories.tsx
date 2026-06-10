import type { Meta, StoryObj } from "@storybook/nextjs";

import { UserManagementPanel } from "./user-management-panel";

const meta = {
  title: "Src/Features/Telecom/Components/UserManagementPanel",
  component: UserManagementPanel,
  tags: ["autodocs"],
} satisfies Meta<typeof UserManagementPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
