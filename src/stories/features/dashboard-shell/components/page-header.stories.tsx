import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Download, Plus } from "lucide-react";

import { PageHeader } from "@/features/dashboard-shell/components/page-header";

const meta = {
  title: "Src/Features/DashboardShell/Components/PageHeader",
  component: PageHeader,
  tags: ["autodocs"],
  args: {
    title: "Dashboard",
    description: "Monitor your datasets, inspect imports, and explore generated insights.",
  },
  argTypes: {
    title: {
      control: "text",
    },
    description: {
      control: "text",
    },
    breadcrumbs: {
      control: "object",
    },
    actions: {
      control: false,
    },
  },
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-5xl bg-background p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PageHeader>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithBreadcrumbs: Story = {
  args: {
    title: "Datasets",
    description: "Manage imported datasets and DuckDB-backed views.",
    breadcrumbs: [
      {
        label: "Dashboard",
        href: "/dashboard",
      },
      {
        label: "Data",
        href: "/dashboard/folders",
      },
      {
        label: "Datasets",
      },
    ],
  },
};

export const WithActions: Story = {
  args: {
    title: "Reports",
    description: "Create, export, and review generated reports.",
    actions: (
      <>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          <Download className="h-4 w-4" />
          Export
        </button>

        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New report
        </button>
      </>
    ),
  },
};

export const FullExample: Story = {
  args: {
    title: "Import History",
    description: "Review uploaded files, processing status, row counts, and validation results.",
    breadcrumbs: [
      {
        label: "Dashboard",
        href: "/dashboard",
      },
      {
        label: "Imports",
        href: "/dashboard/imports",
      },
      {
        label: "History",
      },
    ],
    actions: (
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        <Plus className="h-4 w-4" />
        Import file
      </button>
    ),
  },
};

export const LongTitle: Story = {
  args: {
    title: "Very Long Dashboard Page Title That Should Truncate Instead Of Destroying The Layout",
    description:
      "This checks whether the header behaves correctly when titles get obnoxiously long, as titles tend to do when humans name things.",
    actions: (
      <button
        type="button"
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
      >
        Action
      </button>
    ),
  },
};

export const TitleOnly: Story = {
  args: {
    title: "Settings",
    description: undefined,
    breadcrumbs: undefined,
    actions: undefined,
  },
};
