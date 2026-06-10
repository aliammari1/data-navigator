import type { Meta, StoryObj } from "@storybook/nextjs";
import { RotateCcw } from "lucide-react";

import { AtlasCallout } from "./severity-callout";

const meta = {
  title: "Src/Design/Blocks/SeverityCallout",
  component: AtlasCallout,
  tags: ["autodocs"],
  args: {
    severity: "info",
    title: "Information",
    children:
      "This callout gives the user contextual feedback without screaming at them. A rare mercy.",
  },
  argTypes: {
    severity: {
      control: "select",
      options: ["info", "success", "warning", "danger", "accent"],
    },
    title: {
      control: "text",
    },
    children: {
      control: "text",
    },
    icon: {
      control: false,
    },
    action: {
      control: false,
    },
    className: {
      control: "text",
    },
  },
} satisfies Meta<typeof AtlasCallout>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Info: Story = {
  args: {
    severity: "info",
    title: "Info",
    children: "Your dataset has been loaded and is ready to explore.",
  },
};

export const Success: Story = {
  args: {
    severity: "success",
    title: "Success",
    children: "The import pipeline completed successfully.",
  },
};

export const Warning: Story = {
  args: {
    severity: "warning",
    title: "Warning",
    children: "Some rows were skipped because they contain invalid values.",
  },
};

export const Danger: Story = {
  args: {
    severity: "danger",
    title: "Danger",
    children: "The import failed because the file schema does not match.",
  },
};

export const Accent: Story = {
  args: {
    severity: "accent",
    title: "Suggestion",
    children: "Try mapping your columns before running the next import.",
  },
};

export const WithoutTitle: Story = {
  args: {
    severity: "info",
    title: undefined,
    children: "This callout works without a title too.",
  },
};

export const WithAction: Story = {
  args: {
    severity: "warning",
    title: "Partial import",
    children: "18 rows failed validation. Review them before continuing.",
    action: (
      <button
        type="button"
        className="rounded-(--atlas-radius-2) border border-(--atlas-border) px-2 py-1 text-xs font-medium text-(--atlas-text) hover:bg-(--atlas-surface-raised)"
      >
        Review
      </button>
    ),
  },
};

export const WithCustomIcon: Story = {
  args: {
    severity: "accent",
    title: "Retry available",
    children: "The failed operation can be retried safely.",
    icon: <RotateCcw />,
  },
};
