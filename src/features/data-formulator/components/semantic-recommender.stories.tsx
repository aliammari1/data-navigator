import type { Meta, StoryObj } from "@storybook/nextjs";

import { SemanticRecommender } from "./semantic-recommender";

const meta = {
  title: "Src/Features/DataFormulator/Components/SemanticRecommender",
  component: SemanticRecommender,
  tags: ["autodocs"],
} satisfies Meta<typeof SemanticRecommender>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
