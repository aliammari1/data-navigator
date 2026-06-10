import type { Meta, StoryObj } from "@storybook/nextjs";

import { FileManagementModal } from "./file-management-modal";

const meta = {
  title: "Src/Features/Telecom/Components/FileManagementModal",
  component: FileManagementModal,
  tags: ["autodocs"],
} satisfies Meta<typeof FileManagementModal>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
