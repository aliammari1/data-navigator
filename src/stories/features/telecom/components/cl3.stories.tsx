import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { CL3 } from "@/features/telecom/components/cl3";

const meta = {
  title: "Src/Features/Telecom/Components/CL3",
  component: CL3,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: {
    title: "1.1 Lignes Fixes",
    children: (
      <div className="text-xs text-muted-foreground">
        Détail des transactions de recharge sur lignes fixes.
      </div>
    ),
  },
  argTypes: {
    title: { control: "text" },
    children: { control: false },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 560 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CL3>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ExpandsOnClick: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Lignes Fixes/i }));
    await expect(canvas.getByText(/Détail des transactions/i)).toBeVisible();
  },
};

export const MobileLines: Story = {
  args: {
    title: "1.2 Lignes Mobiles",
  },
};
