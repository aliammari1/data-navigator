import type { Meta, StoryObj } from "@storybook/nextjs";

import { ModelReadinessCenter } from "./model-readiness-center";

const meta = {
  title: "Src/Features/DataFormulator/Components/ModelReadinessCenter",
  component: ModelReadinessCenter,
  tags: ["autodocs"],
} satisfies Meta<typeof ModelReadinessCenter>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
