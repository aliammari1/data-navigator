import type { Meta, StoryObj } from "@storybook/nextjs";
import { BarChart3, Download } from "lucide-react";

import { AtlasSection } from "./section";

const meta = {
  title: "Src/Design/Blocks/Section",
  component: AtlasSection,
  tags: ["autodocs"],
  args: {
    title: "Data Overview",
    description: "A compact section wrapper for dashboards and panels.",
    children: <div className="text-sm text-(--atlas-text-subtle)">Section content goes here.</div>,
    pad: "md",
    initial: false,
  },
  argTypes: {
    title: {
      control: "text",
    },
    description: {
      control: "text",
    },
    pad: {
      control: "select",
      options: ["none", "sm", "md", "lg"],
    },
    initial: {
      control: "boolean",
    },
    icon: {
      control: false,
    },
    action: {
      control: false,
    },
    badge: {
      control: false,
    },
    children: {
      control: false,
    },
    contentClassName: {
      control: "text",
    },
  },
} satisfies Meta<typeof AtlasSection>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithIcon: Story = {
  args: {
    icon: <BarChart3 />,
  },
};

export const WithBadge: Story = {
  args: {
    badge: (
      <span className="rounded-full bg-(--atlas-accent-soft) px-2 py-0.5 text-[10px] font-semibold text-(--atlas-accent-fg)">
        Live
      </span>
    ),
  },
};

export const WithAction: Story = {
  args: {
    action: (
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-(--atlas-radius-2) border border-(--atlas-border) px-2 py-1 text-xs font-medium text-(--atlas-text) hover:bg-(--atlas-surface-raised)"
      >
        <Download className="h-3 w-3" />
        Export
      </button>
    ),
  },
};

export const NoPadding: Story = {
  args: {
    title: "Raw Content",
    description: "Useful when the child component handles its own spacing.",
    pad: "none",
    children: (
      <div className="divide-y divide-(--atlas-border)">
        <div className="px-4 py-3 text-sm text-(--atlas-text)">Row one</div>
        <div className="px-4 py-3 text-sm text-(--atlas-text)">Row two</div>
        <div className="px-4 py-3 text-sm text-(--atlas-text)">Row three</div>
      </div>
    ),
  },
};

export const FullExample: Story = {
  args: {
    title: "Import Pipeline",
    description: "Monitor ingestion status, errors, and dataset freshness.",
    icon: <BarChart3 />,
    badge: (
      <span className="rounded-full bg-(--atlas-success-soft) px-2 py-0.5 text-[10px] font-semibold text-(--atlas-success-fg)">
        Healthy
      </span>
    ),
    action: (
      <button
        type="button"
        className="rounded-(--atlas-radius-2) border border-(--atlas-border) px-2 py-1 text-xs font-medium text-(--atlas-text) hover:bg-(--atlas-surface-raised)"
      >
        View details
      </button>
    ),
    children: (
      <div className="grid gap-2 text-sm text-(--atlas-text-subtle)">
        <p>Last import completed successfully.</p>
        <p>12 datasets processed.</p>
      </div>
    ),
  },
};
