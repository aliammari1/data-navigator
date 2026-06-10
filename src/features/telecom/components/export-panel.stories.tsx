import type { Meta, StoryObj } from "@storybook/nextjs";

import { ExportPanel } from "./export-panel";

const meta = {
  title: "Src/Features/Telecom/Components/ExportPanel",
  component: ExportPanel,
  tags: ["autodocs"],
} satisfies Meta<typeof ExportPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
