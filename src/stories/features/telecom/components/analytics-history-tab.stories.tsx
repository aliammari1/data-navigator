import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import type { AnalyticsSnapshotHistoryMeta } from "@/features/telecom/lib/analytics-sqlite-snapshot";
import { AnalyticsHistoryTab } from "@/features/telecom/components/analytics-history-tab";

const entries: AnalyticsSnapshotHistoryMeta[] = [
  {
    id: 1,
    tableName: "telecom_2024_06_01",
    label: "transactions_2024-06-01.csv",
    savedAt: new Date("2024-06-01T18:42:00").getTime(),
    fileName: "transactions_2024-06-01.csv",
    sizeBytes: 4096,
    totalTransactions: 24812,
    successRate: 94.7,
  },
  {
    id: 2,
    tableName: "telecom_2024_05_31",
    label: "transactions_2024-05-31.csv",
    savedAt: new Date("2024-05-31T19:05:00").getTime(),
    fileName: "transactions_2024-05-31.csv",
    sizeBytes: 4096,
    totalTransactions: 23190,
    successRate: 91.2,
  },
  {
    id: 3,
    tableName: "telecom_2024_05_30",
    label: "transactions_2024-05-30.csv",
    savedAt: new Date("2024-05-30T17:58:00").getTime(),
    fileName: "transactions_2024-05-30.csv",
    sizeBytes: 4096,
    totalTransactions: 25640,
    successRate: 88.4,
  },
];

const meta = {
  title: "Src/Features/Telecom/Components/AnalyticsHistoryTab",
  component: AnalyticsHistoryTab,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    entries,
    onRefresh: fn(),
    onLoad: fn(),
    onExportDatabase: fn(),
  },
  argTypes: {
    entries: { control: "object" },
    onRefresh: { control: false },
    onLoad: { control: false },
    onExportDatabase: { control: false },
  },
} satisfies Meta<typeof AnalyticsHistoryTab>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: { entries: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Aucun historique analytics/i)).toBeInTheDocument();
  },
};

export const LoadsSnapshotOnClick: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("transactions_2024-06-01.csv"));
    await expect(args.onLoad).toHaveBeenCalledWith(1);
  },
};

export const RefreshAndExport: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Actualiser/i }));
    await expect(args.onRefresh).toHaveBeenCalledTimes(1);
    await userEvent.click(canvas.getByRole("button", { name: /Export DB/i }));
    await expect(args.onExportDatabase).toHaveBeenCalledTimes(1);
  },
};
