import type { Meta, StoryObj } from "@storybook/nextjs";

import { ConfigTab } from "./config-tab";

const meta = {
  title: "Src/Features/Telecom/Components/ConfigTab",
  component: ConfigTab,
  tags: ["autodocs"],
} satisfies Meta<typeof ConfigTab>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
