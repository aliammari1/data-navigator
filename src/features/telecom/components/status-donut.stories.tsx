import type { Meta, StoryObj } from "@storybook/nextjs";

import { StatusDonut } from "./status-donut";

const meta = {
  title: "Src/Features/Telecom/Components/StatusDonut",
  component: StatusDonut,
  tags: ["autodocs"],
} satisfies Meta<typeof StatusDonut>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
