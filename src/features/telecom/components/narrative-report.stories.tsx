import type { Meta, StoryObj } from "@storybook/nextjs";

import { NarrativeReport } from "./narrative-report";

const meta = {
  title: "Src/Features/Telecom/Components/NarrativeReport",
  component: NarrativeReport,
  tags: ["autodocs"],
} satisfies Meta<typeof NarrativeReport>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
