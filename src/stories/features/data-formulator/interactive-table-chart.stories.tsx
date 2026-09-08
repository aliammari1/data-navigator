import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { InteractiveTableChart } from "@/features/data-formulator/components/moudir-chat/interactive-table-chart";

const chartableHastTable = {
  tagName: "table",
  children: [
    {
      tagName: "thead",
      children: [
        {
          tagName: "tr",
          children: [
            { tagName: "th", children: [{ type: "text", value: "Canal" }] },
            { tagName: "th", children: [{ type: "text", value: "Montant" }] },
            { tagName: "th", children: [{ type: "text", value: "Volume" }] },
          ],
        },
      ],
    },
    {
      tagName: "tbody",
      children: [
        {
          tagName: "tr",
          children: [
            { tagName: "td", children: [{ type: "text", value: "USSD" }] },
            { tagName: "td", children: [{ type: "text", value: "45000000" }] },
            { tagName: "td", children: [{ type: "text", value: "12450" }] },
          ],
        },
        {
          tagName: "tr",
          children: [
            { tagName: "td", children: [{ type: "text", value: "WEB" }] },
            { tagName: "td", children: [{ type: "text", value: "32000000" }] },
            { tagName: "td", children: [{ type: "text", value: "8320" }] },
          ],
        },
        {
          tagName: "tr",
          children: [
            { tagName: "td", children: [{ type: "text", value: "AGENCE" }] },
            { tagName: "td", children: [{ type: "text", value: "18500000" }] },
            { tagName: "td", children: [{ type: "text", value: "3100" }] },
          ],
        },
        {
          tagName: "tr",
          children: [
            { tagName: "td", children: [{ type: "text", value: "MOBILE_APP" }] },
            { tagName: "td", children: [{ type: "text", value: "24100000" }] },
            { tagName: "td", children: [{ type: "text", value: "5940" }] },
          ],
        },
      ],
    },
  ],
};

const nonChartableHastTable = {
  tagName: "table",
  children: [
    {
      tagName: "thead",
      children: [
        {
          tagName: "tr",
          children: [
            { tagName: "th", children: [{ type: "text", value: "Paramètre" }] },
            { tagName: "th", children: [{ type: "text", value: "Description" }] },
          ],
        },
      ],
    },
    {
      tagName: "tbody",
      children: [
        {
          tagName: "tr",
          children: [
            { tagName: "td", children: [{ type: "text", value: "Timeout" }] },
            { tagName: "td", children: [{ type: "text", value: "Délai maximum en secondes" }] },
          ],
        },
        {
          tagName: "tr",
          children: [
            { tagName: "td", children: [{ type: "text", value: "Retry" }] },
            { tagName: "td", children: [{ type: "text", value: "Nombre de réessais autorisés" }] },
          ],
        },
      ],
    },
  ],
};

const DefaultTableChildren = (
  <>
    <thead>
      <tr className="border-b border-border/60">
        <th className="p-2.5 text-left font-semibold text-muted-foreground">Canal</th>
        <th className="p-2.5 text-right font-semibold text-muted-foreground">Montant</th>
        <th className="p-2.5 text-right font-semibold text-muted-foreground">Volume</th>
      </tr>
    </thead>
    <tbody>
      <tr className="border-b border-border/40">
        <td className="p-2.5 font-medium">USSD</td>
        <td className="p-2.5 text-right font-mono">45 000 000</td>
        <td className="p-2.5 text-right font-mono">12 450</td>
      </tr>
      <tr className="border-b border-border/40">
        <td className="p-2.5 font-medium">WEB</td>
        <td className="p-2.5 text-right font-mono">32 000 000</td>
        <td className="p-2.5 text-right font-mono">8 320</td>
      </tr>
      <tr className="border-b border-border/40">
        <td className="p-2.5 font-medium">AGENCE</td>
        <td className="p-2.5 text-right font-mono">18 500 000</td>
        <td className="p-2.5 text-right font-mono">3 100</td>
      </tr>
      <tr>
        <td className="p-2.5 font-medium">MOBILE_APP</td>
        <td className="p-2.5 text-right font-mono">24 100 000</td>
        <td className="p-2.5 text-right font-mono">5 940</td>
      </tr>
    </tbody>
  </>
);

const NonChartableChildren = (
  <>
    <thead>
      <tr className="border-b border-border/60">
        <th className="p-2.5 text-left font-semibold text-muted-foreground">Paramètre</th>
        <th className="p-2.5 text-left font-semibold text-muted-foreground">Description</th>
      </tr>
    </thead>
    <tbody>
      <tr className="border-b border-border/40">
        <td className="p-2.5 font-medium">Timeout</td>
        <td className="p-2.5">Délai maximum en secondes</td>
      </tr>
      <tr>
        <td className="p-2.5 font-medium">Retry</td>
        <td className="p-2.5">Nombre de réessais autorisés</td>
      </tr>
    </tbody>
  </>
);

/**
 * InteractiveTableChart adds conversational Chat-with-Chart visualization toggling
 * to Markdown tables rendered in Moudir chat messages.
 */
const meta = {
  title: "Src/Features/DataFormulator/Components/InteractiveTableChart",
  component: InteractiveTableChart,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: {
    node: chartableHastTable,
    children: DefaultTableChildren,
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-3xl mx-auto p-4 bg-background">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof InteractiveTableChart>;

export default meta;

type Story = StoryObj<typeof meta>;

export const TableToChartToggle: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Initial state: rendered as table with Chat-with-Chart banner
    await expect(canvas.getByText("Chat-with-Chart")).toBeInTheDocument();
    await expect(canvas.getByText("USSD")).toBeInTheDocument();

    // Toggle to chart view
    const chartToggleBtn = canvas.getByRole("button", {
      name: /Afficher en graphique \(Chat-with-Chart\)/i,
    });
    await userEvent.click(chartToggleBtn);

    // Chart mode is now active with chart type controls visible
    await expect(canvas.getByTitle("Barres")).toBeInTheDocument();
    await expect(canvas.getByTitle("Lignes")).toBeInTheDocument();
    await expect(canvas.getByTitle("Camembert")).toBeInTheDocument();

    // Toggle back to table view
    const tableBtn = canvas.getByRole("button", { name: /^Tableau$/i });
    await userEvent.click(tableBtn);

    // Table view restored
    await expect(canvas.getByText("USSD")).toBeInTheDocument();
  },
};

export const BarView: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Switch to chart mode
    const chartBtn = canvas.getByRole("button", { name: /^Graphique$/i });
    await userEvent.click(chartBtn);

    const barButton = canvas.getByTitle("Barres");
    await userEvent.click(barButton);

    await expect(barButton).toHaveClass("bg-primary/15");
  },
};

export const LineView: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Switch to chart mode
    const chartBtn = canvas.getByRole("button", { name: /^Graphique$/i });
    await userEvent.click(chartBtn);

    const lineButton = canvas.getByTitle("Lignes");
    await userEvent.click(lineButton);

    await expect(lineButton).toHaveClass("bg-primary/15");
  },
};

export const PieView: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Switch to chart mode
    const chartBtn = canvas.getByRole("button", { name: /^Graphique$/i });
    await userEvent.click(chartBtn);

    const pieButton = canvas.getByTitle("Camembert");
    await userEvent.click(pieButton);

    await expect(pieButton).toHaveClass("bg-primary/15");
  },
};

export const NonChartableTable: Story = {
  args: {
    node: nonChartableHastTable,
    children: NonChartableChildren,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // No chart toggle toolbar rendered for text-only tables
    await expect(canvas.queryByText("Chat-with-Chart")).not.toBeInTheDocument();
    await expect(canvas.getByText("Timeout")).toBeInTheDocument();
  },
};
