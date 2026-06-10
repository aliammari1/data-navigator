import type { Meta, StoryObj } from "@storybook/nextjs";

import { ProfileCards } from "./profile-cards";

const meta = {
  title: "Src/Features/ParsedData/Components/ProfileCards",
  component: ProfileCards,
  tags: ["autodocs"],
} satisfies Meta<typeof ProfileCards>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
