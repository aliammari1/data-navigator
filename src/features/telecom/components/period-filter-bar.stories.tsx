import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { PeriodFilterBar } from "./period-filter-bar";

const availableDays = [
  "2024-06-07",
  "2024-06-06",
  "2024-06-05",
  "2024-06-04",
  "2024-06-03",
  "2024-06-02",
  "2024-06-01",
];

const meta = {
  title: "Src/Features/Telecom/Components/PeriodFilterBar",
  component: PeriodFilterBar,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    value: { from: "2024-06-01", to: "2024-06-07" },
    availableDays,
    busy: false,
    onChange: fn(),
    onApply: fn(),
  },
  argTypes: {
    value: { control: false },
    availableDays: { control: false },
    onChange: { control: false },
    onApply: { control: false },
    busy: { control: "boolean" },
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 760, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PeriodFilterBar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoDataLoaded: Story = {
  args: {
    availableDays: [],
    value: { from: "2024-06-01", to: "2024-06-08" },
  },
};

export const InvalidRange: Story = {
  args: {
    value: { from: "2024-06-07", to: "2024-06-01" },
  },
};

export const Busy: Story = {
  args: { busy: true },
};

export const AppliesPeriod: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Appliquer/i }));
    await expect(args.onApply).toHaveBeenCalledTimes(1);
  },
};

export const PresetEmitsChange: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Dernier jour chargé/i }));
    await expect(args.onChange).toHaveBeenCalledWith({
      from: "2024-06-07",
      to: "2024-06-07",
    });
  },
};
