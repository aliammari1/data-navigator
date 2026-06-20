import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { FileText } from "lucide-react";
import { expect, userEvent, within } from "storybook/test";

import { CL1 } from "./cl1";

const meta = {
  title: "Src/Features/Telecom/Components/CL1",
  component: CL1,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: {
    title: "I. Bill Payment",
    icon: FileText,
    accentBg: "bg-blue-500/15",
    accentColor: "text-blue-600 dark:text-blue-400",
    accentGlow: "bg-linear-to-r from-blue-500/0 via-blue-500/50 to-blue-500/0",
    dateFrom: "2024-06-01",
    dateTo: "2024-06-01",
    children: (
      <div className="text-xs text-muted-foreground">
        Contenu de la section — tableaux de canaux et statistiques.
      </div>
    ),
  },
  argTypes: {
    title: { control: "text" },
    icon: { control: false },
    children: { control: false },
    summaryGroups: { control: false },
    fetchSpecChannelStats: { control: false },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 640 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CL1>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ExpandsOnClick: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const header = canvas.getByRole("button", { name: /Bill Payment/i });
    await userEvent.click(header);
    await expect(canvas.getByText(/Contenu de la section/i)).toBeVisible();
  },
};

export const RechargeAccent: Story = {
  args: {
    title: "II. Recharge",
    accentBg: "bg-emerald-500/15",
    accentColor: "text-emerald-600 dark:text-emerald-400",
    accentGlow: "bg-linear-to-r from-emerald-500/0 via-emerald-500/50 to-emerald-500/0",
  },
};
