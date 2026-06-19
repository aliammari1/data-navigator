import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Activity, Phone, Users } from "lucide-react";
import { expect, fn, userEvent, within } from "storybook/test";

import { KPICard } from "./kpi-card";

/**
 * Reference story: this is the canonical pattern for component stories in this
 * repo — realistic args, named variants that cover the meaningful prop space,
 * an interaction `play` test, and accessibility coverage (inherited from the
 * global a11y addon, which runs on every story).
 */
const meta = {
  title: "Src/Features/Telecom/Components/KPICard",
  component: KPICard,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  args: {
    label: "Transactions",
    value: "24 812",
    sub: "Aujourd'hui",
    icon: <Activity className="h-4 w-4 text-indigo-400" />,
    color: "bg-card border-border",
    trend: "up",
    trendValue: "+12,4 %",
    size: "md",
  },
  argTypes: {
    size: { control: "select", options: ["xs", "sm", "md", "lg"] },
    trend: { control: "inline-radio", options: ["up", "down", "neutral"] },
    value: { control: "text" },
    icon: { control: false },
    onToggle: { control: false },
  },
} satisfies Meta<typeof KPICard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const TrendUp: Story = {
  args: { trend: "up", trendValue: "+8,1 %" },
};

export const TrendDown: Story = {
  args: {
    label: "Échecs",
    value: "318",
    trend: "down",
    trendValue: "-3,2 %",
    icon: <Phone className="h-4 w-4 text-red-400" />,
    color: "bg-red-500/5 border-red-500/20",
  },
};

export const HeroSize: Story = {
  args: { size: "lg", label: "MSISDNs uniques", value: "1,2 M", icon: <Users className="h-5 w-5 text-emerald-400" /> },
};

export const Compact: Story = {
  args: { size: "xs", sub: undefined, trendValue: undefined },
};

/**
 * Selectable variant: when `kpiKey` is set the card renders an export checkbox.
 * The play function asserts the toggle handler fires on click.
 */
export const SelectableTogglesOnClick: Story = {
  args: {
    kpiKey: "totalTransactions",
    selected: false,
    onToggle: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const checkbox = canvas.getByRole("button", { name: /sélectionner pour l'export/i });
    await userEvent.click(checkbox);
    await expect(args.onToggle).toHaveBeenCalledTimes(1);
  },
};

export const SelectedState: Story = {
  args: {
    kpiKey: "totalTransactions",
    selected: true,
    onToggle: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // When selected, the control advertises the de-select action.
    await expect(
      canvas.getByRole("button", { name: /désélectionner pour l'export/i }),
    ).toBeInTheDocument();
  },
};
