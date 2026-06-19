import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import type { WidgetState } from "@/features/agent-canvas/core/types";
import { AnomalyDrawer } from "./AnomalyDrawer";

const rawData: Record<string, unknown>[] = [
  { month: "Jan", revenue: 1200, orders: 42, conversionRate: 2.1 },
  { month: "Feb", revenue: 1350, orders: 45, conversionRate: 2.3 },
  { month: "Mar", revenue: 1280, orders: 44, conversionRate: 2.2 },
  { month: "Apr", revenue: 1420, orders: 48, conversionRate: 2.4 },
  { month: "May", revenue: 1390, orders: 47, conversionRate: 2.3 },
  { month: "Jun", revenue: 1510, orders: 50, conversionRate: 2.5 },
  { month: "Jul", revenue: 1480, orders: 49, conversionRate: 2.4 },
  { month: "Aug", revenue: 1320, orders: 43, conversionRate: 2.2 },
  { month: "Sep", revenue: 1550, orders: 51, conversionRate: 2.6 },
  { month: "Oct", revenue: 1490, orders: 50, conversionRate: 2.5 },

  // Deliberate outliers, because otherwise the drawer politely vanishes.
  { month: "Nov", revenue: 8200, orders: 180, conversionRate: 9.8 },
  { month: "Dec", revenue: 260, orders: 8, conversionRate: 0.4 },
];

const widget: WidgetState = {
  spec: {
    id: "sales-anomaly-widget",
    title: "Monthly Sales Revenue",
    chartType: "line",
    sqlIntent: "Analyze monthly revenue, order count, and conversion rate for anomalies.",
    dimensions: ["month"],
    metrics: ["revenue", "orders", "conversionRate"],
    position: {
      x: 0,
      y: 0,
      w: 8,
      h: 4,
    },
    reasoning:
      "Revenue, orders, and conversion rate are numeric metrics where anomalies can reveal unusual business behavior.",
  },
  status: "done",
  sql: "select month, revenue, orders, conversion_rate from monthly_sales order by month",
  rawData,
  insight: "November has unusually high revenue and order volume.",
};

const meta = {
  title: "Src/Features/AgentCanvas/Components/AnomalyDrawer",
  component: AnomalyDrawer,
  tags: ["autodocs"],
  args: {
    widget,
    onFilter: fn(),
  },
  argTypes: {
    widget: {
      control: "object",
    },
    onFilter: {
      control: false,
    },
  },
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="min-h-[240px] w-[420px] bg-slate-950 p-6">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="mb-3 text-sm font-semibold text-white">Widget toolbar preview</p>
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof AnomalyDrawer>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const MultipleOutlierColumns: Story = {
  args: {
    widget,
  },
};

export const RevenueOnlyOutlier: Story = {
  args: {
    widget: {
      ...widget,
      spec: {
        ...widget.spec,
        id: "revenue-only-anomaly-widget",
        title: "Revenue Outliers",
        metrics: ["revenue"],
      },
      rawData: [
        { month: "Jan", revenue: 1200 },
        { month: "Feb", revenue: 1350 },
        { month: "Mar", revenue: 1280 },
        { month: "Apr", revenue: 1420 },
        { month: "May", revenue: 1390 },
        { month: "Jun", revenue: 1510 },
        { month: "Jul", revenue: 1480 },
        { month: "Aug", revenue: 1320 },
        { month: "Sep", revenue: 1550 },
        { month: "Oct", revenue: 1490 },
        { month: "Nov", revenue: 8200 },
      ],
    },
  },
};

export const NoAnomalies: Story = {
  args: {
    widget: {
      ...widget,
      rawData: [
        { month: "Jan", revenue: 1200, orders: 42 },
        { month: "Feb", revenue: 1250, orders: 44 },
        { month: "Mar", revenue: 1300, orders: 46 },
        { month: "Apr", revenue: 1350, orders: 47 },
        { month: "May", revenue: 1400, orders: 49 },
        { month: "Jun", revenue: 1450, orders: 50 },
      ],
    },
  },
};
