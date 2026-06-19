import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Database, Upload, Users } from "lucide-react";

import { StatsCard } from "./stats-card";

const meta = {
  title: "Src/Features/DashboardShell/Components/StatsCard",
  component: StatsCard,
  tags: ["autodocs"],
  args: {
    title: "Total datasets",
    value: "24",
    description: "Uploaded and indexed datasets",
  },
  argTypes: {
    title: {
      control: "text",
    },
    value: {
      control: "text",
    },
    description: {
      control: "text",
    },
    trend: {
      control: "number",
    },
    icon: {
      control: false,
    },
    className: {
      control: "text",
    },
  },
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="w-[360px] bg-background p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StatsCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithIcon: Story = {
  args: {
    icon: <Database className="h-5 w-5" />,
  },
};

export const PositiveTrend: Story = {
  args: {
    title: "Active users",
    value: "1,284",
    description: "Users active this week",
    trend: 12.5,
    icon: <Users className="h-5 w-5" />,
  },
};

export const NegativeTrend: Story = {
  args: {
    title: "Failed imports",
    value: 17,
    description: "Imports that need review",
    trend: -8.2,
    icon: <Upload className="h-5 w-5" />,
  },
};

export const NeutralTrend: Story = {
  args: {
    title: "Processing jobs",
    value: 42,
    description: "No major change",
    trend: 0,
  },
};

export const TitleAndValueOnly: Story = {
  args: {
    title: "Rows processed",
    value: "2.4M",
    description: undefined,
    trend: undefined,
    icon: undefined,
  },
};
