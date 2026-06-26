import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import type { ColProfile } from "@/features/parsed-data/model/types";

import { ColCard, MiniBar, QualityRing, StatGrid } from "@/features/parsed-data/components/profile-cards";

/**
 * `profile-cards` exports four data-profiling pieces: `QualityRing`, `MiniBar`,
 * `ColCard`, and `StatGrid`. The original story imported a non-existent
 * `ProfileCards` symbol. This file uses the interactive `ColCard` as the
 * representative meta component (with a `play` test for its click handler) and
 * renders the other three through dedicated `render` stories.
 */

const sampleProfile: ColProfile = {
  name: "revenue",
  index: 2,
  type: "float",
  sqlType: "DOUBLE",
  rowCount: 12_480,
  nullCount: 312,
  nullRate: 0.025,
  distinctCount: 9_842,
  uniquenessRate: 0.79,
  min: 0,
  max: 9_900,
  avg: 1_284,
  topValues: [
    { value: "1200", count: 84, pct: 0.0067 },
    { value: "980", count: 61, pct: 0.0049 },
  ],
  completeness: 0.975,
  uniqueness: 0.79,
  validity: 0.96,
};

const meta = {
  title: "Src/Features/ParsedData/Components/ProfileCards",
  component: ColCard,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  args: {
    profile: sampleProfile,
    selected: false,
    onClick: fn(),
  },
  argTypes: {
    profile: { control: "object" },
    selected: { control: "boolean" },
    onClick: { control: false },
  },
  decorators: [
    (Story) => (
      <div className="w-[340px] bg-background p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ColCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Selected: Story = {
  args: { selected: true },
};

export const LowQuality: Story = {
  args: {
    profile: {
      ...sampleProfile,
      name: "notes",
      type: "string",
      sqlType: "VARCHAR",
      nullRate: 0.42,
      completeness: 0.58,
      uniqueness: 0.31,
      validity: 0.6,
      distinctCount: 4_120,
    },
  },
};

export const FiresOnClick: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button"));
    await expect(args.onClick).toHaveBeenCalledTimes(1);
  },
};

export const Ring: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <QualityRing score={0.95} />
      <QualityRing score={0.7} />
      <QualityRing score={0.35} size={64} />
    </div>
  ),
};

export const Bar: Story = {
  render: () => (
    <div className="flex w-[280px] flex-col gap-3">
      <MiniBar value={9} max={10} color="#22c55e" />
      <MiniBar value={5} max={10} color="#f59e0b" />
      <MiniBar value={2} max={10} color="#ef4444" />
    </div>
  ),
};

export const Stats: Story = {
  render: () => (
    <div className="w-[360px]">
      <StatGrid
        items={[
          { label: "Rows", value: "12,480" },
          { label: "Distinct", value: "9,842" },
          { label: "Nulls", value: "312", highlight: true },
          { label: "Min", value: "0" },
          { label: "Max", value: "9,900" },
          { label: "Avg", value: "1,284" },
        ]}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("12,480")).toBeInTheDocument();
  },
};
