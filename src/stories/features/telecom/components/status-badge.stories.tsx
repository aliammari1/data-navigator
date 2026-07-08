import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { StatusMapping } from "@/features/telecom/types";
import { StatusBadge } from "@/features/telecom/components/status-badge";

const mapping: StatusMapping[] = [
  {
    rawCode: "00",
    label: "Réussie",
    semantic: "success",
    color: "emerald",
    badgeClass: "bg-emerald-50 text-emerald-700",
  },
  {
    rawCode: "51",
    label: "Refusée",
    semantic: "declined",
    color: "red",
    badgeClass: "bg-red-50 text-red-700",
  },
];

const meta = {
  title: "Src/Features/Telecom/Components/StatusBadge",
  component: StatusBadge,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  args: {
    status: "SUCCESS",
  },
  argTypes: {
    status: {
      control: "select",
      options: ["SUCCESS", "DECLINED", "INSTANCE", "REFUND", "SUBMITTED", "OTHER"],
    },
    mapping: { control: false },
  },
} satisfies Meta<typeof StatusBadge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Success: Story = {};

export const Declined: Story = {
  args: { status: "DECLINED" },
};

export const Instance: Story = {
  args: { status: "INSTANCE" },
};

export const Refund: Story = {
  args: { status: "REFUND" },
};

export const Submitted: Story = {
  args: { status: "SUBMITTED" },
};

export const UnknownFallsBackToOther: Story = {
  args: { status: "WEIRD_CODE" },
};

export const WithRawCodeMapping: Story = {
  args: { status: "00", mapping },
};
