import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { WidgetSpec, WidgetState } from "@/features/agent-canvas/core/types";
import { WidgetCard } from "./WidgetCard";

const baseSpec: WidgetSpec = {
  id: "revenue-widget",
  title: "Revenue by Region",
  chartType: "bar",
  sqlIntent: "Group revenue by region and sort by total revenue descending.",
  dimensions: ["region"],
  metrics: ["revenue"],
  position: {
    x: 0,
    y: 0,
    w: 6,
    h: 4,
  },
  reasoning: "A bar chart is effective for comparing revenue across regions.",
};

const doneWidget: WidgetState = {
  spec: baseSpec,
  status: "done",
  sql: `
SELECT
  region,
  SUM(revenue) AS total_revenue
FROM sales
GROUP BY region
ORDER BY total_revenue DESC;
`.trim(),
  rawData: [
    { region: "North", revenue: 42000 },
    { region: "South", revenue: 31000 },
    { region: "East", revenue: 28000 },
    { region: "West", revenue: 52000 },
    { region: "Enterprise", revenue: 180000 },
  ],
  echartsOption: {
    tooltip: {
      trigger: "axis",
    },
    xAxis: {
      type: "category",
      data: ["North", "South", "East", "West", "Enterprise"],
    },
    yAxis: {
      type: "value",
    },
    series: [
      {
        type: "bar",
        data: [42000, 31000, 28000, 52000, 180000],
      },
    ],
  },
  insight: "Enterprise revenue is a strong outlier compared with other regions.",
};

const kpiWidget: WidgetState = {
  spec: {
    ...baseSpec,
    id: "kpi-widget",
    title: "Executive KPIs",
    chartType: "kpi-grid",
    sqlIntent: "Calculate total revenue, order count, and average order value.",
    dimensions: [],
    metrics: ["revenue", "orders", "aov"],
  },
  status: "done",
  sql: `
SELECT
  SUM(revenue) AS total_revenue,
  COUNT(*) AS order_count,
  AVG(revenue) AS average_order_value
FROM sales;
`.trim(),
  kpis: [
    {
      label: "Revenue",
      value: "$128.4K",
      sub: "Current dataset",
      colorClass: "text-emerald-400",
      iconHint: "revenue",
    },
    {
      label: "Orders",
      value: "2,431",
      sub: "Completed orders",
      colorClass: "text-blue-400",
      iconHint: "orders",
    },
    {
      label: "AOV",
      value: "$52.82",
      sub: "Average order value",
      colorClass: "text-violet-400",
      iconHint: "average",
    },
  ],
  insight: "Revenue is healthy, but average order value could be improved.",
};

const tableWidget: WidgetState = {
  spec: {
    ...baseSpec,
    id: "table-widget",
    title: "Top Customers",
    chartType: "data-table",
    sqlIntent: "List top customers by revenue.",
    dimensions: ["customer"],
    metrics: ["revenue"],
  },
  status: "done",
  sql: `
SELECT
  customer,
  region,
  revenue
FROM customers
ORDER BY revenue DESC
LIMIT 5;
`.trim(),
  tableHeaders: ["Customer", "Region", "Revenue"],
  tableRows: [
    ["Acme Corp", "North", "$42,000"],
    ["Globex", "West", "$38,500"],
    ["Initech", "South", "$31,200"],
    ["Umbrella", "East", "$26,900"],
  ],
};

const meta = {
  title: "Src/Features/AgentCanvas/Components/WidgetCard",
  component: WidgetCard,
  tags: ["autodocs"],
  args: {
    widget: doneWidget,
    index: 0,
    dragHandleClass: "drag-handle",
  },
  argTypes: {
    widget: {
      control: "object",
    },
    index: {
      control: "number",
    },
    dragHandleClass: {
      control: "text",
    },
    className: {
      control: "text",
    },
  },
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="h-[360px] w-[560px] bg-slate-950 p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof WidgetCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const KPIGrid: Story = {
  args: {
    widget: kpiWidget,
  },
};

export const DataTable: Story = {
  args: {
    widget: tableWidget,
  },
};

export const Pending: Story = {
  args: {
    widget: {
      spec: {
        ...baseSpec,
        id: "pending-widget",
        title: "Pending Widget",
        chartType: "line",
      },
      status: "pending",
    },
  },
};

export const Querying: Story = {
  args: {
    widget: {
      spec: {
        ...baseSpec,
        id: "querying-widget",
        title: "Querying Revenue Trend",
        chartType: "line",
      },
      status: "querying",
      sql: `
SELECT
  month,
  SUM(revenue) AS revenue
FROM sales
GROUP BY month
ORDER BY month;
`.trim(),
    },
  },
};

export const Building: Story = {
  args: {
    widget: {
      spec: {
        ...baseSpec,
        id: "building-widget",
        title: "Building Chart",
        chartType: "area",
      },
      status: "building",
      sql: `
SELECT
  month,
  SUM(revenue) AS revenue
FROM sales
GROUP BY month
ORDER BY month;
`.trim(),
    },
  },
};

export const Errors: Story = {
  args: {
    widget: {
      spec: {
        ...baseSpec,
        id: "error-widget",
        title: "Broken Revenue Widget",
        chartType: "bar",
      },
      status: "error",
      error: "DuckDB query failed: column `revenue_total` does not exist.",
      sql: `
SELECT
  region,
  SUM(revenue_total) AS revenue
FROM sales
GROUP BY region;
`.trim(),
    },
  },
};

export const WithInsight: Story = {
  args: {
    widget: {
      ...doneWidget,
      insight: "West region is outperforming the rest of the dataset by a significant margin.",
    },
  },
};

export const WithAnomalyDrawer: Story = {
  args: {
    widget: {
      ...doneWidget,
      rawData: [
        { region: "North", revenue: 42000 },
        { region: "South", revenue: 31000 },
        { region: "East", revenue: 28000 },
        { region: "West", revenue: 52000 },
        { region: "Enterprise", revenue: 180000 },
        { region: "Tiny Account", revenue: 300 },
      ],
    },
  },
};
