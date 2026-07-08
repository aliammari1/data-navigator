import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { UserManagementPanel } from "@/features/telecom/components/user-management-panel";

/**
 * `UserManagementPanel` manages accounts through the `users` module (local
 * store) and bootstraps a default admin on mount. The app now has a single
 * implicit admin role, so the panel always renders the full account
 * management UI (create-user form, role edit, delete).
 */
const meta = {
  title: "Src/Features/Telecom/Components/UserManagementPanel",
  component: UserManagementPanel,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 900, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof UserManagementPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: /Créer/i })).toBeVisible();
  },
};
