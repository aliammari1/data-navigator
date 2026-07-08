import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StatusStep } from "@/features/data-import/model/helpers";

/**
 * `helpers.tsx` is mostly pure functions (covered by unit tests); `StatusStep`
 * is its only React export, so the story targets that component.
 */
const meta = {
  title: "Src/Features/DataImport/StatusStep",
  component: StatusStep,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: {
    label: "Parsing CSV",
    status: "active",
  },
  argTypes: {
    status: { control: "inline-radio", options: ["pending", "active", "done", "error"] },
    duration: { control: "number" },
  },
} satisfies Meta<typeof StatusStep>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Pending: Story = { args: { status: "pending", label: "Waiting" } };
export const Active: Story = { args: { status: "active", label: "Parsing CSV" } };
export const Done: Story = { args: { status: "done", label: "Parsed 24,812 rows", duration: 318 } };
export const ErrorState: Story = { args: { status: "error", label: "Failed to parse" } };

export const Pipeline: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <StatusStep label="Read file" status="done" duration={42} />
      <StatusStep label="Detect schema" status="done" duration={88} />
      <StatusStep label="Profile columns" status="active" />
      <StatusStep label="Persist dataset" status="pending" />
    </div>
  ),
};
