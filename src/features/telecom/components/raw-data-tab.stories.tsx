import type { Meta, StoryObj } from "@storybook/nextjs";

import { RawDataTab } from "./raw-data-tab";

const meta = {
  title: "Src/Features/Telecom/Components/RawDataTab",
  component: RawDataTab,
  tags: ["autodocs"],
} satisfies Meta<typeof RawDataTab>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
