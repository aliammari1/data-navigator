import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { LanStatusDock } from "@/features/dashboard-shell/components/lan-status-dock";

/**
 * LanStatusDock is the fixed bottom-left LAN status pill. It reads connection
 * status + peer count from the `lan-collab` platform module and toggles the
 * full LanControlCenter popover open/closed. It is hidden below the `md`
 * breakpoint, so the decorator gives it a wide enough viewport. The `play`
 * test exercises the open/close toggle.
 */
const meta = {
  title: "Src/Features/DashboardShell/Components/LanStatusDock",
  component: LanStatusDock,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    viewport: { defaultViewport: "responsive" },
  },
  decorators: [
    (Story) => (
      <div className="relative h-[640px] w-full min-w-[820px] bg-background">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LanStatusDock>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const TogglesControlCenter: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole("button", { name: /lan/i });
    await userEvent.click(toggle);
    await expect(canvas.getByText(/share with nearby devices/i)).toBeInTheDocument();
    // Clicking again collapses the control center.
    await userEvent.click(toggle);
  },
};
