import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { AIInsightsPanel } from "@/features/telecom/components/ai-insights-panel";
import type { AIInsight } from "@/features/telecom/types";

const insights: AIInsight[] = [
  {
    id: "drop-success-rate",
    severity: "critical",
    title: "Chute du taux de réussite",
    body: "Le taux de réussite global est tombé à 72,1 % cette semaine, contre 94,7 % la semaine précédente. Le canal Data by Voucher concentre la majorité des échecs.",
    metric: "72,1 % (-22,6 pts)",
  },
  {
    id: "high-declines",
    severity: "warning",
    title: "Volume d'échecs en hausse",
    body: "6 200 transactions refusées sur la période, principalement pour solde insuffisant entre 18h et 20h.",
    metric: "6 200 échecs",
  },
  {
    id: "peak-hour",
    severity: "info",
    title: "Pic d'activité à 18h",
    body: "Le volume horaire culmine à 18h avec 3 240 transactions, soit 13 % du trafic quotidien.",
    metric: "18h · 3 240 tx",
  },
  {
    id: "recovery",
    severity: "positive",
    title: "Reprise sur Mobile by TTCASH",
    body: "Le canal Mobile by TTCASH affiche un taux de réussite de 95 %, en amélioration de 2,3 points sur 7 jours.",
    metric: "95,0 % (+2,3 pts)",
  },
];

const meta = {
  title: "Src/Features/Telecom/Components/AIInsightsPanel",
  component: AIInsightsPanel,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: {
    insights,
    loading: false,
  },
  argTypes: {
    insights: { control: "object" },
    loading: { control: "boolean" },
  },
} satisfies Meta<typeof AIInsightsPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Chute du taux de réussite/i)).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: { loading: true, insights: [] },
};

export const Empty: Story = {
  args: { loading: false, insights: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Aucune anomalie détectée/i)).toBeInTheDocument();
  },
};

export const SingleCritical: Story = {
  args: {
    loading: false,
    insights: [insights[0]],
  },
};
