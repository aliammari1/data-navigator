import type { Meta, StoryObj } from "@storybook/nextjs";
import { Activity, Database, Users } from "lucide-react";

import { AtlasKPI } from "./kpi-card";

const meta = {
  title: "Src/Design/Blocks/KpiCard",
  component: AtlasKPI,
  tags: ["autodocs"],
  args: {
    label: "Revenue",
    value: "$24.8K",
    delta: 12.4,
    hint: "vs previous month",
    severity: "accent",
  },
  argTypes: {
    severity: {
      control: "select",
      options: ["info", "success", "warning", "danger", "accent"],
    },
    delta: {
      control: "number",
    },
    label: {
      control: "text",
    },
    value: {
      control: "text",
    },
    hint: {
      control: "text",
    },
    icon: {
      control: false,
    },
  },
} satisfies Meta<typeof AtlasKPI>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithIcon: Story = {
  args: {
    icon: <Activity />,
  },
};

export const PositiveDelta: Story = {
  args: {
    label: "Active Users",
    value: "18,240",
    delta: 8.7,
    hint: "healthy growth",
    severity: "success",
    icon: <Users />,
  },
};

export const NegativeDelta: Story = {
  args: {
    label: "Failed Imports",
    value: 37,
    delta: -4.2,
    hint: "needs attention",
    severity: "danger",
    icon: <Database />,
  },
};

export const NeutralDelta: Story = {
  args: {
    label: "Queue Size",
    value: 128,
    delta: 0,
    hint: "unchanged",
    severity: "info",
  },
};

export const WithoutDelta: Story = {
  args: {
    label: "Datasets",
    value: 42,
    delta: undefined,
    hint: "available sources",
    severity: "warning",
  },
};
