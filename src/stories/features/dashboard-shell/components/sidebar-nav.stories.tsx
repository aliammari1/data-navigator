import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";

import { DashboardLayout, type DashboardUser } from "@/features/dashboard-shell/components/sidebar-nav";

const demoUser: DashboardUser = {
  name: "Ali Ammari",
  email: "ali@example.com",
  image: null,
};

const meta = {
  title: "Src/Features/DashboardShell/Components/DashboardLayout",
  component: DashboardLayout,
  tags: ["autodocs"],
  args: {
    user: demoUser,
    onAiToggle: fn(),
    children: (
      <div className="min-h-full bg-background p-6">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h1 className="text-xl font-bold text-foreground">Dashboard content</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This area represents the page content rendered inside the dashboard layout.
          </p>
        </div>
      </div>
    ),
  },
  argTypes: {
    user: {
      control: "object",
    },
    onAiToggle: {
      control: false,
    },
    children: {
      control: false,
    },
  },
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof DashboardLayout>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AnonymousUser: Story = {
  args: {
    user: undefined,
  },
};

export const WithoutAiToggle: Story = {
  args: {
    onAiToggle: undefined,
  },
};

export const WithLargePageContent: Story = {
  args: {
    children: (
      <div className="min-h-full bg-background p-6">
        <div className="grid gap-4 md:grid-cols-3">
          {["Datasets", "Charts", "Reports"].map((label) => (
            <section key={label} className="rounded-2xl border border-border bg-card p-5">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-bold text-foreground">12,480</p>
            </section>
          ))}
        </div>

        <section className="mt-4 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-base font-semibold text-foreground">Main workspace</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Use this story to preview the sidebar, topbar, command palette, dataset picker, user
            menu, and page content layout together.
          </p>
        </section>
      </div>
    ),
  },
};
