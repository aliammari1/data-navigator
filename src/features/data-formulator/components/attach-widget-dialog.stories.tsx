import type { Meta, StoryObj } from "@storybook/nextjs";

import { AttachWidgetDialog } from "./attach-widget-dialog";

const meta = {
  title: "Src/Features/DataFormulator/Components/AttachWidgetDialog",
  component: AttachWidgetDialog,
  tags: ["autodocs"],
} satisfies Meta<typeof AttachWidgetDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
