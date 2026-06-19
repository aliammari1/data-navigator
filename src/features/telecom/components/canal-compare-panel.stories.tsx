import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";

import type { SpecChRow } from "@/features/telecom/lib/queries";
import type { ChannelDef } from "@/features/telecom/lib/report-engine";
import { CanalComparePanel } from "./canal-compare-panel";

// Resolve deterministic per-channel stats so the bar chart + scorecard fill in.
const fetchSpecChannelStats = async (
  channels: ChannelDef[],
  _dateFrom: string,
  _dateTo: string,
): Promise<{ rows: SpecChRow[]; total: SpecChRow }> => {
  const rows: SpecChRow[] = channels.map((c, i) => ({
    canal: c.name ?? `Canal ${i + 1}`,
    nombre: 1200 + i * 430,
    montant: 850_000 + i * 320_000,
  }));
  const total: SpecChRow = {
    canal: "Total",
    nombre: rows.reduce((s, r) => s + r.nombre, 0),
    montant: rows.reduce((s, r) => s + r.montant, 0),
  };
  return { rows, total };
};

const meta = {
  title: "Src/Features/Telecom/Components/CanalComparePanel",
  component: CanalComparePanel,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: {
    dateFrom: "2024-06-01",
    dateTo: "2024-06-01",
    fetchSpecChannelStats,
  },
  argTypes: {
    dateFrom: { control: "text" },
    dateTo: { control: "text" },
    fetchSpecChannelStats: { control: false },
  },
} satisfies Meta<typeof CanalComparePanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WeekWindow: Story = {
  args: {
    dateFrom: "2024-05-25",
    dateTo: "2024-06-01",
  },
};

/**
 * The selector starts with two groups active and shows a "n / 4" counter.
 * Clicking an unselected group adds it to the comparison.
 */
export const AddsGroupOnClick: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/2 \/ 4 sélectionnés/i)).toBeInTheDocument();
    const buttons = canvas.getAllByRole("button");
    // Click the third group pill to add it to the selection.
    await userEvent.click(buttons[2]);
    await expect(canvas.getByText(/3 \/ 4 sélectionnés/i)).toBeInTheDocument();
  },
};
