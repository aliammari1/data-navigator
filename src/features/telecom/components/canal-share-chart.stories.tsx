import type { Meta, StoryObj } from "@storybook/nextjs";
import { FileText, Smartphone, Tag, Wifi, Zap } from "lucide-react";

import type { CanalSummary } from "@/features/telecom/types";
import { CanalShareChart } from "./canal-share-chart";

const baseCanal: Omit<
  CanalSummary,
  "key" | "label" | "icon" | "total" | "share" | "amount"
> = {
  color: "text-blue-600",
  bgColor: "bg-blue-50",
  borderColor: "border-blue-200",
  success: 0,
  declined: 0,
  refund: 0,
  instance: 0,
  submitted: 0,
  successRate: 93,
  avgAmount: 750,
};

const canals: CanalSummary[] = [
  { ...baseCanal, key: "bill_payment", label: "Bill Payment", icon: FileText, total: 8200, share: 33, amount: 6_200_000 },
  { ...baseCanal, key: "voice_mobile_ttcash", label: "Mobile by TTCASH", icon: Smartphone, total: 6400, share: 26, amount: 4_800_000 },
  { ...baseCanal, key: "data_sabba", label: "Internet Sabba", icon: Wifi, total: 4100, share: 17, amount: 2_300_000 },
  { ...baseCanal, key: "voucher_for_payment", label: "Voucher For Payment", icon: Tag, total: 3200, share: 13, amount: 1_450_000 },
  { ...baseCanal, key: "credit_transfer", label: "Credit Transfer", icon: Zap, total: 2912, share: 11, amount: 980_000 },
];

const meta = {
  title: "Src/Features/Telecom/Components/CanalShareChart",
  component: CanalShareChart,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  args: {
    canals,
  },
  argTypes: {
    canals: { control: "object" },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 460 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CanalShareChart>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SingleCanal: Story = {
  args: {
    canals: [canals[0]],
  },
};

export const Empty: Story = {
  args: {
    canals: [],
  },
};
