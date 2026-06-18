import type { Meta, StoryObj } from "@storybook/nextjs";
import { expect, userEvent, within } from "storybook/test";

import SettingsScreen from "./SettingsScreen";

/**
 * SettingsScreen is the preferences workspace (Appearance, Data, Performance,
 * Account, Notifications, Storage, Shortcuts, About). It is backed by the
 * browser-safe settings store and lazily mounts each tab's panel, so it renders
 * fully in Storybook. The `play` tests switch tabs and assert the lazy panels
 * resolve.
 */
const meta = {
  title: "Src/Features/Settings/Screens/SettingsScreen",
  component: SettingsScreen,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="flex h-screen w-full bg-background">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SettingsScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const PerformanceTab: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: /performance/i }),
    );
    // The lazily-loaded panel surfaces the reload notice.
    await expect(await canvas.findByText(/applies on reload/i)).toBeVisible();
  },
};

export const StorageTab: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /^storage$/i }));
    await expect(
      await canvas.findByText(/device storage/i),
    ).toBeInTheDocument();
  },
};

export const AboutTab: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /about/i }));
    await expect(
      await canvas.findByText(/about datanavigator/i),
    ).toBeInTheDocument();
  },
};
