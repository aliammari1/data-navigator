import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { ChatChartArtifact } from "@/features/data-formulator/components/moudir-chat/chat-chart-artifact";
import type { ChartPart } from "@/features/data-formulator/store/moudir-chat-store";

const sampleBarPart: ChartPart = {
  kind: "chart",
  chartType: "bar",
  x: "canal",
  y: "montant",
  aggregate: "sum",
  title: "Montant total par canal de distribution",
  datasetId: null,
  rows: [
    { canal: "USSD", montant: 45000000, x_val: "USSD", y_val: 45000000 },
    { canal: "WEB", montant: 32000000, x_val: "WEB", y_val: 32000000 },
    { canal: "AGENCE", montant: 18500000, x_val: "AGENCE", y_val: 18500000 },
    { canal: "MOBILE_APP", montant: 24100000, x_val: "MOBILE_APP", y_val: 24100000 },
  ],
};

const sampleLinePart: ChartPart = {
  kind: "chart",
  chartType: "line",
  x: "date",
  y: "montant",
  aggregate: "sum",
  title: "Évolution quotidienne du chiffre d'affaires",
  datasetId: null,
  rows: [
    { date: "2024-06-01", montant: 12000000, x_val: "2024-06-01", y_val: 12000000 },
    { date: "2024-06-02", montant: 15400000, x_val: "2024-06-02", y_val: 15400000 },
    { date: "2024-06-03", montant: 18900000, x_val: "2024-06-03", y_val: 18900000 },
    { date: "2024-06-04", montant: 14200000, x_val: "2024-06-04", y_val: 14200000 },
  ],
};

const samplePiePart: ChartPart = {
  kind: "chart",
  chartType: "pie",
  x: "statut",
  y: "volume",
  aggregate: "count",
  title: "Répartition par statut de transaction",
  datasetId: null,
  rows: [
    { statut: "SUCCESS", volume: 21500, x_val: "SUCCESS", y_val: 21500 },
    { statut: "FAILED", volume: 2800, x_val: "FAILED", y_val: 2800 },
    { statut: "PENDING", volume: 512, x_val: "PENDING", y_val: 512 },
  ],
};

/**
 * ChatChartArtifact renders inline interactive ECharts visualizations produced
 * by Moudir AI `make_chart` turns or Chat-with-Chart table conversions.
 */
const meta = {
  title: "Src/Features/DataFormulator/Components/ChatChartArtifact",
  component: ChatChartArtifact,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: {
    part: sampleBarPart,
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-3xl mx-auto p-4 bg-background">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChatChartArtifact>;

export default meta;

type Story = StoryObj<typeof meta>;

export const BarChart: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Verify artifact title
    await expect(
      await canvas.findByText("Montant total par canal de distribution"),
    ).toBeInTheDocument();

    // Verify grounding provenance subtitle
    await expect(canvas.getByText(/canal · somme\(montant\)/i)).toBeInTheDocument();

    // Verify actions toolbar
    await expect(canvas.getByRole("button", { name: /Épingler/i })).toBeInTheDocument();
  },
};

export const LineChart: Story = {
  args: {
    part: sampleLinePart,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("Évolution quotidienne du chiffre d'affaires"),
    ).toBeInTheDocument();
    await expect(canvas.getByText(/date · somme\(montant\)/i)).toBeInTheDocument();
  },
};

export const PieChart: Story = {
  args: {
    part: samplePiePart,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("Répartition par statut de transaction"),
    ).toBeInTheDocument();
    await expect(canvas.getByText(/statut · volume/i)).toBeInTheDocument();
  },
};
