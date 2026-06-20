import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { FileText, Smartphone, Tag, Zap } from "lucide-react";

import type { CanalSummary } from "@/features/telecom/types";
import { AmountPieChart } from "./amount-pie-chart";

const baseCanal: Omit<CanalSummary, "key" | "label" | "icon" | "amount"> = {
  color: "text-blue-600",
  bgColor: "bg-blue-50",
  borderColor: "border-blue-200",
  total: 5200,
  success: 4940,
  declined: 200,
  refund: 40,
  instance: 15,
  submitted: 5,
  successRate: 95,
  avgAmount: 750,
  share: 20,
};

const canals: CanalSummary[] = [
  { ...baseCanal, key: "bill_payment", label: "Bill Payment", icon: FileText, amount: 6_200_000 },
  {
    ...baseCanal,
    key: "voice_mobile_ttcash",
    label: "Mobile by TTCASH",
    icon: Smartphone,
    amount: 4_800_000,
  },
  { ...baseCanal, key: "data_sabba", label: "Internet Sabba", icon: Smartphone, amount: 2_300_000 },
  {
    ...baseCanal,
    key: "voucher_for_payment",
    label: "Voucher For Payment",
    icon: Tag,
    amount: 1_450_000,
  },
  { ...baseCanal, key: "credit_transfer", label: "Credit Transfer", icon: Zap, amount: 980_000 },
];

const meta = {
  title: "Src/Features/Telecom/Components/AmountPieChart",
  component: AmountPieChart,
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
      <div style={{ width: 420 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AmountPieChart>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SingleGroup: Story = {
  args: {
    canals: [canals[0]],
  },
};

export const Empty: Story = {
  args: {
    canals: [],
  },
};
