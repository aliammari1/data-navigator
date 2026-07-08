import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import type { DailyLineageEntry } from "@/features/telecom/lib/daily-stats-cache";
import { DataLineagePanel } from "@/features/telecom/components/data-lineage-panel";

const lineage: DailyLineageEntry[] = [
  {
    fileName: "transactions_2024-06-01_part1.csv",
    fileKey: "key-1",
    size: 4_820_000,
    rows: 12400,
    ingestedAt: new Date("2024-06-01T08:12:00").getTime(),
    tableName: "tx_2024_06_01_a",
  },
  {
    fileName: "transactions_2024-06-01_part2.csv",
    fileKey: "key-2",
    size: 3_140_000,
    rows: 8900,
    ingestedAt: new Date("2024-06-01T12:45:00").getTime(),
    tableName: "tx_2024_06_01_b",
  },
  {
    fileName: "transactions_2024-06-01_late.csv",
    fileKey: "key-3",
    size: 1_020_000,
    rows: 3512,
    ingestedAt: new Date("2024-06-01T19:03:00").getTime(),
    tableName: "tx_2024_06_01_c",
  },
];

const meta = {
  title: "Src/Features/Telecom/Components/DataLineagePanel",
  component: DataLineagePanel,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: {
    day: "2024-06-01",
    lineage,
    computedAt: new Date("2024-06-01T19:10:00").getTime(),
  },
  argTypes: {
    day: { control: "text" },
    lineage: { control: "object" },
    computedAt: { control: false },
  },
} satisfies Meta<typeof DataLineagePanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Fichiers contributeurs/i)).toBeInTheDocument();
  },
};

export const SingleFile: Story = {
  args: {
    lineage: [lineage[0]],
  },
};

export const Empty: Story = {
  args: {
    lineage: [],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Pas de lignée enregistrée pour ce jour/i)).toBeInTheDocument();
  },
};
