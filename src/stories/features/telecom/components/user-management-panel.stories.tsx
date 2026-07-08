import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { UserManagementPanel } from "@/features/telecom/components/user-management-panel";

/**
 * `UserManagementPanel` manages accounts through the `users` module (local
 * store) and bootstraps a default admin on mount. Props control the current
 * role and surface role changes to the parent.
 */
const meta = {
  title: "Src/Features/Telecom/Components/UserManagementPanel",
  component: UserManagementPanel,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    currentRole: "admin",
    onRoleChange: fn(),
  },
  argTypes: {
    currentRole: { control: "inline-radio", options: ["admin", "user"] },
    onRoleChange: { control: false },
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

export const AdminView: Story = {};

export const UserView: Story = {
  args: { currentRole: "user" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/création de comptes désactivée/i)).toBeVisible();
  },
};

export const SwitchesRoleOnClick: Story = {
  args: { currentRole: "admin" },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /User/i }));
    await expect(args.onRoleChange).toHaveBeenCalledWith("user");
  },
};
