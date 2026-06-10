import type { Meta, StoryObj } from "@storybook/nextjs";

import { FileDropZone } from "./file-drop-zone";

const meta = {
  title: "Src/Features/Telecom/Components/FileDropZone",
  component: FileDropZone,
  tags: ["autodocs"],
} satisfies Meta<typeof FileDropZone>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
