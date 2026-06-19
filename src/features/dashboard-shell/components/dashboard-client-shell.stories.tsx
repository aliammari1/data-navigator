import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { DashboardUser } from "@/features/dashboard-shell/components/sidebar-nav";
import { DashboardClientShell } from "./dashboard-client-shell";

const demoUser: DashboardUser = {
  name: "Ali Ammari",
  email: "ali@example.com",
  image: undefined,
};

const meta = {
  title: "Src/Features/DashboardShell/Components/DashboardClientShell",
  component: DashboardClientShell,
  tags: ["autodocs"],
  args: {
    user: demoUser,
    children: (
      <main className="min-h-screen bg-background p-6">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
          <p className="mt-2 text-sm text-muted-foreground">Main dashboard content renders here.</p>
        </div>
      </main>
    ),
  },
  argTypes: {
    user: {
      control: "object",
    },
    children: {
      control: false,
    },
  },
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof DashboardClientShell>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AnonymousUser: Story = {
  args: {
    user: undefined,
  },
};

export const WithLargeContent: Story = {
  args: {
    children: (
      <main className="min-h-screen bg-background p-6">
        <div className="grid gap-4 md:grid-cols-3">
          {["Revenue", "Users", "Imports"].map((label) => (
            <section key={label} className="rounded-2xl border border-border bg-card p-5">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-bold text-foreground">12,480</p>
            </section>
          ))}
        </div>

        <section className="mt-4 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-base font-semibold text-foreground">Dataset Overview</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This placeholder content lets you preview the shell layout, sidebar, LAN gate, AI panel
            toggle, and dock placement.
          </p>
        </section>
      </main>
    ),
  },
};
