import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { LanControlCenter } from "@/features/dashboard-shell/components/lan-control-center";

/**
 * LanControlCenter is the LAN collaboration panel (host / join a session,
 * generate an access code + QR, list peers). It takes no props — all state
 * comes from the browser-safe `lan-collab` platform module. Stories drive the
 * mode tabs and code generation through `play` interaction tests.
 */
const meta = {
  title: "Src/Features/DashboardShell/Components/LanControlCenter",
  component: LanControlCenter,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="bg-background p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LanControlCenter>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const HostMode: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /start a session/i }));
    await expect(canvas.getByText(/start the server on this computer/i)).toBeInTheDocument();
  },
};

export const JoinMode: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /join a session/i }));
    await expect(canvas.getByText(/ask the host for the qr code/i)).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /join session/i })).toBeInTheDocument();
  },
};

export const GeneratesAccessCode: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Ensure we are in host mode where the code generator is visible.
    await userEvent.click(canvas.getByRole("button", { name: /start a session/i }));
    const generate = canvas.getByRole("button", { name: /generate new code/i });
    await userEvent.click(generate);
    // After generating, a 6-digit code should be present in the panel.
    await expect(canvas.getByText(/access code/i)).toBeInTheDocument();
  },
};

export const TogglesAdvanced: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /start a session/i }));
    await userEvent.click(canvas.getByRole("button", { name: /advanced/i }));
    await expect(canvas.getByRole("option", { name: /host — full control/i })).toBeInTheDocument();
  },
};
