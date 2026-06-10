import type { Meta, StoryObj } from "@storybook/nextjs";

import { AlertBanner } from "./alert-banner";

const meta = {
  title: "Src/Features/Telecom/Components/AlertBanner",
  component: AlertBanner,
  tags: ["autodocs"],
} satisfies Meta<typeof AlertBanner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
