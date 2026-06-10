import type { Meta, StoryObj } from "@storybook/nextjs";

import { TopAccountsLeaderboard } from "./top-accounts-leaderboard";

const meta = {
  title: "Src/Features/Telecom/Components/TopAccountsLeaderboard",
  component: TopAccountsLeaderboard,
  tags: ["autodocs"],
} satisfies Meta<typeof TopAccountsLeaderboard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
