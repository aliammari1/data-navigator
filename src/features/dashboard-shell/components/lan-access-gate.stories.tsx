import type { Meta, StoryObj } from "@storybook/nextjs";

import { LanAccessGate } from "./lan-access-gate";

const meta = {
  title: "Src/Features/DashboardShell/Components/LanAccessGate",
  component: LanAccessGate,
  tags: ["autodocs"],
  args: {
    isAdmin: false,
    children: (
      <main className="min-h-[calc(100vh-4rem)] bg-background p-6">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h1 className="text-xl font-bold text-foreground">Dashboard content</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This content is shown after LAN access is allowed.
          </p>
        </div>
      </main>
    ),
  },
  argTypes: {
    isAdmin: {
      control: "boolean",
    },
    children: {
      control: false,
    },
  },
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LanAccessGate>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AdminBypass: Story = {
  args: {
    isAdmin: true,
  },
};

export const UserGate: Story = {
  args: {
    isAdmin: false,
  },
};
