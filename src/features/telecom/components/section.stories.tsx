import type { Meta, StoryObj } from "@storybook/nextjs";

import { Section } from "./section";

const meta = {
  title: "Src/Features/Telecom/Components/Section",
  component: Section,
  tags: ["autodocs"],
} satisfies Meta<typeof Section>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
