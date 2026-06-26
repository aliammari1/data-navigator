import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CreditCard, Phone, Wifi } from "lucide-react";

import type { CanalSummary } from "@/features/telecom/types";
import { RiskScoreChart } from "@/features/telecom/components/risk-score-chart";

const canals: CanalSummary[] = [
  {
    key: "bill_payment",
    label: "Paiement facture",
    icon: CreditCard,
    color: "text-indigo-500",
    bgColor: "bg-indigo-500/10",
    borderColor: "border-indigo-500/20",
    total: 12_400,
    success: 11_980,
    declined: 320,
    refund: 60,
    instance: 30,
    submitted: 10,
    amount: 248_100.5,
    successRate: 96.6,
    avgAmount: 20.0,
    share: 0.5,
  },
  {
    key: "voice_mobile_ttcash",
    label: "Recharge mobile TTcash",
    icon: Phone,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
    total: 8_100,
    success: 7_540,
    declined: 480,
    refund: 50,
    instance: 20,
    submitted: 10,
    amount: 121_500.0,
    successRate: 93.1,
    avgAmount: 15.0,
    share: 0.33,
  },
  {
    key: "data_sabba",
    label: "Data Sabba",
    icon: Wifi,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
    total: 4_300,
    success: 3_650,
    declined: 600,
    refund: 30,
    instance: 15,
    submitted: 5,
    amount: 64_500.0,
    successRate: 84.9,
    avgAmount: 15.0,
    share: 0.17,
  },
];

const meta = {
  title: "Src/Features/Telecom/Components/RiskScoreChart",
  component: RiskScoreChart,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    canals,
  },
  argTypes: {
    canals: { control: false },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 640, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RiskScoreChart>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SingleCanal: Story = {
  args: { canals: [canals[0]] },
};

export const Empty: Story = {
  args: { canals: [] },
};
