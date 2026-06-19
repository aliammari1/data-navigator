import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import type { AnalyticsSnapshotMeta } from "@/platform/storage/app-db";
import { FileManagementModal } from "./file-management-modal";
import type { LoadedFile } from "../types";

const loadedFiles: LoadedFile[] = [
  {
    id: 1,
    name: "Rapport transactions 2024-06-01",
    table: "telecom_2024_06_01",
    date: "2024-06-01",
    cacheKey: "cache-2024-06-01",
    size: 8_452_113,
    lastModified: Date.parse("2024-06-01T08:30:00Z"),
    sourceKeys: ["bill_payment", "voice_mobile_ttcash"],
  },
  {
    id: 2,
    name: "Rapport transactions 2024-06-02",
    table: "telecom_2024_06_02",
    date: "2024-06-02",
    cacheKey: "cache-2024-06-02",
    size: 9_127_884,
    lastModified: Date.parse("2024-06-02T08:30:00Z"),
    sourceKeys: ["bill_payment"],
  },
];

const analyticsHistory: AnalyticsSnapshotMeta[] = [
  {
    key: "snap-2024-06-01",
    fileName: "Rapport transactions 2024-06-01",
    savedAt: Date.parse("2024-06-01T18:45:00Z"),
    totalTransactions: 24_812,
    successRate: 0.962,
  } as AnalyticsSnapshotMeta,
  {
    key: "snap-2024-05-31",
    fileName: "Rapport transactions 2024-05-31",
    savedAt: Date.parse("2024-05-31T18:45:00Z"),
    totalTransactions: 22_104,
    successRate: 0.948,
  } as AnalyticsSnapshotMeta,
];

const meta = {
  title: "Src/Features/Telecom/Components/FileManagementModal",
  component: FileManagementModal,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    open: true,
    analyticsHistory,
    loadedFiles,
    activeFileIdx: 1,
    canMutate: true,
    canExport: true,
    onClose: fn(),
    onUpload: fn(),
    onLoadAnalytics: fn(),
    onExportDatabase: fn(),
    onSelectFile: fn(),
    onRenameFile: fn(),
  },
  argTypes: {
    open: { control: "boolean" },
    activeFileIdx: { control: "number" },
    canMutate: { control: "boolean" },
    canExport: { control: "boolean" },
    analyticsHistory: { control: false },
    loadedFiles: { control: false },
  },
} satisfies Meta<typeof FileManagementModal>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: {
    loadedFiles: [],
    analyticsHistory: [],
  },
};

export const ReadOnly: Story = {
  args: {
    canMutate: false,
    canExport: false,
  },
};

export const ClosedRendersNothing: Story = {
  args: { open: false },
};

export const ExportsDatabaseOnClick: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: /exporter la base/i }),
    );
    await expect(args.onExportDatabase).toHaveBeenCalledTimes(1);
  },
};

export const LoadsAnalyticsSnapshot: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByText("Rapport transactions 2024-05-31"),
    );
    await expect(args.onLoadAnalytics).toHaveBeenCalledWith("snap-2024-05-31");
  },
};
