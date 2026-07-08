import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { CL2 } from "@/features/telecom/components/cl2";

const meta = {
  title: "Src/Features/Telecom/Components/CL2",
  component: CL2,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: {
    title: "1. Recharge Voix",
    dateFrom: "2024-06-01",
    dateTo: "2024-06-01",
    children: (
      <div className="text-xs text-muted-foreground">
        Lignes fixes et mobiles — détail des recharges par méthode.
      </div>
    ),
  },
  argTypes: {
    title: { control: "text" },
    children: { control: false },
    summaryGroups: { control: false },
    fetchSpecChannelStats: { control: false },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 600 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CL2>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ExpandsOnClick: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Recharge Voix/i }));
    await expect(canvas.getByText(/Lignes fixes et mobiles/i)).toBeVisible();
  },
};

export const DataSection: Story = {
  args: {
    title: "2. Recharge DATA — Lignes Mobiles uniquement",
  },
};
