import type { Meta, StoryObj } from "@storybook/nextjs";
import { Activity, BarChart3 } from "lucide-react";
import { expect, userEvent, within } from "storybook/test";

import { Section } from "./section";

const meta = {
  title: "Src/Features/Telecom/Components/Section",
  component: Section,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    title: "Répartition par canal",
    icon: <BarChart3 className="h-4 w-4" />,
    children: (
      <p className="text-sm text-muted-foreground">
        24 812 transactions traitées le 2024-06-01, dont 96,2 % de réussite.
      </p>
    ),
  },
  argTypes: {
    title: { control: "text" },
    collapsible: { control: "boolean" },
    defaultOpen: { control: "boolean" },
    icon: { control: false },
    children: { control: false },
    badge: { control: false },
    action: { control: false },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 640, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Section>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithBadge: Story = {
  args: {
    badge: "10 canaux",
    icon: <Activity className="h-4 w-4" />,
  },
};

export const WithAction: Story = {
  args: {
    action: (
      <button
        type="button"
        className="rounded-lg border border-border px-2 py-1 text-[11px] font-semibold"
      >
        Exporter
      </button>
    ),
  },
};

export const Collapsible: Story = {
  args: {
    collapsible: true,
    defaultOpen: true,
  },
};

export const CollapsibleTogglesContent: Story = {
  args: {
    collapsible: true,
    defaultOpen: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(/24 812 transactions traitées/i),
    ).toBeVisible();
    await userEvent.click(canvas.getByText("Répartition par canal"));
  },
};
