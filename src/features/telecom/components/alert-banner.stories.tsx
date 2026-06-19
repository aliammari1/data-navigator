import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Phone, Smartphone } from "lucide-react";
import { expect, within } from "storybook/test";

import type { CanalSummary, KPISummary } from "@/features/telecom/types";
import { AlertBanner } from "./alert-banner";

const healthyKpi: KPISummary = {
  totalTransactions: 24812,
  successCount: 23498,
  declinedCount: 1014,
  refundCount: 180,
  instanceCount: 80,
  submittedCount: 40,
  successRate: 94.7,
  totalAmount: 18_452_300,
  avgAmount: 743.6,
  avgProcessingMs: 412,
  uniqueCustomers: 8421,
  peakHour: 18,
  topErrorCode: "INSUFFICIENT_BALANCE",
};

const baseCanal: Omit<CanalSummary, "key" | "label" | "icon" | "successRate"> = {
  color: "text-emerald-600",
  bgColor: "bg-emerald-50",
  borderColor: "border-emerald-200",
  total: 5200,
  success: 4940,
  declined: 200,
  refund: 40,
  instance: 15,
  submitted: 5,
  amount: 3_900_000,
  avgAmount: 750,
  share: 21,
};

const healthyCanals: CanalSummary[] = [
  {
    ...baseCanal,
    key: "voice_mobile_ttcash",
    label: "Mobile by TTCASH",
    icon: Smartphone,
    successRate: 95.0,
  },
  {
    ...baseCanal,
    key: "voice_fixed_ttcash",
    label: "Fixed by TTCASH",
    icon: Phone,
    successRate: 92.4,
  },
];

const meta = {
  title: "Src/Features/Telecom/Components/AlertBanner",
  component: AlertBanner,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: {
    kpi: healthyKpi,
    canals: healthyCanals,
  },
  argTypes: {
    kpi: { control: "object" },
    canals: { control: "object" },
  },
} satisfies Meta<typeof AlertBanner>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Healthy metrics + an active top error code: only the info-level alert renders.
 */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(/code d'erreur le plus fréquent/i),
    ).toBeInTheDocument();
  },
};

/**
 * Success rate below the 90% objective triggers a warning banner.
 */
export const Warning: Story = {
  args: {
    kpi: { ...healthyKpi, successRate: 87.3 },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(/inférieur à l'objectif de 90%/i),
    ).toBeInTheDocument();
  },
};

/**
 * Collapsed success rate and a high decline volume both escalate to critical.
 */
export const Critical: Story = {
  args: {
    kpi: {
      ...healthyKpi,
      successRate: 72.1,
      declinedCount: 6200,
    },
    canals: [
      {
        ...baseCanal,
        key: "data_evoucher",
        label: "Data by Voucher",
        icon: Smartphone,
        successRate: 64.8,
        total: 900,
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/attention immédiate requise/i)).toBeInTheDocument();
  },
};

/**
 * All metrics nominal and no top error code → the component renders nothing.
 */
export const NoAlerts: Story = {
  args: {
    kpi: { ...healthyKpi, topErrorCode: "N/A" },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The component returns null when there is nothing to surface.
    await expect(canvas.queryByText(/réussite|échec|erreur/i)).toBeNull();
  },
};
