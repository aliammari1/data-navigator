import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { LanCollabPanel } from "./lan-collab-panel";

/**
 * `LanCollabPanel` is self-contained: it reads/writes its session settings
 * through the `lan-collab` module and takes no props. The stories exercise the
 * default (offline) setup flow rendered on mount.
 */
const meta = {
  title: "Src/Features/Telecom/Components/LanCollabPanel",
  component: LanCollabPanel,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 720, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LanCollabPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Offline: Story = {};

export const ShowsSetupSteps: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Run the server on this computer/i)).toBeVisible();
    await expect(canvas.getByText(/Configure your session/i)).toBeVisible();
  },
};

export const TogglesAdvancedOptions: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText(/Advanced options/i));
    await expect(canvas.getByRole("button", { name: /Probe server/i })).toBeVisible();
  },
};
