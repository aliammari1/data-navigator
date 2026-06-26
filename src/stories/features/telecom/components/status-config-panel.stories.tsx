import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import type { RawStatusRow, StatusMapping } from "@/features/telecom/types";
import { StatusConfigPanel } from "@/features/telecom/components/status-config-panel";

const rawStatuses: RawStatusRow[] = [
  { rawCode: "00", count: 23_874, amount: 438_210.5 },
  { rawCode: "51", count: 612, amount: 11_240.0 },
  { rawCode: "HOLD", count: 198, amount: 3_120.0 },
  { rawCode: "RFND", count: 84, amount: 1_560.75 },
];

const mapping: StatusMapping[] = [
  {
    rawCode: "00",
    label: "Réussie",
    semantic: "success",
    color: "emerald",
    badgeClass:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
  },
  {
    rawCode: "51",
    label: "Refusée",
    semantic: "declined",
    color: "red",
    badgeClass:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
  },
];

const meta = {
  title: "Src/Features/Telecom/Components/StatusConfigPanel",
  component: StatusConfigPanel,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    rawStatuses,
    mapping,
    tableName: "telecom_2024_06_01",
    onUpdateMapping: fn(),
  },
  argTypes: {
    rawStatuses: { control: false },
    mapping: { control: false },
    onUpdateMapping: { control: false },
    tableName: { control: "text" },
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 760, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StatusConfigPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoMappingsYet: Story = {
  args: { mapping: [] },
};

export const NoStatusesDetected: Story = {
  args: { rawStatuses: [], mapping: [] },
};

export const AutoMapAllEmitsMapping: Story = {
  args: { mapping: [] },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Auto-Map All/i }));
    await expect(args.onUpdateMapping).toHaveBeenCalledTimes(1);
  },
};
