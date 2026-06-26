import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { WidgetSpec, WidgetState } from "@/features/agent-canvas/core/types";
import { WidgetRenderer } from "@/features/agent-canvas/components/WidgetRenderer";

const baseSpec: WidgetSpec = {
  id: "revenue-widget",
  title: "Revenue by Region",
  chartType: "bar",
  sqlIntent: "Group total revenue by region.",
  dimensions: ["region"],
  metrics: ["revenue"],
  position: {
    x: 0,
    y: 0,
    w: 6,
    h: 4,
  },
};

const chartWidget: WidgetState = {
  spec: baseSpec,
  status: "done",
  rawData: [
    { region: "North", revenue: 42000 },
    { region: "South", revenue: 31000 },
    { region: "East", revenue: 28000 },
    { region: "West", revenue: 52000 },
  ],
  echartsOption: {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
    },
    grid: {
      top: 24,
      right: 16,
      bottom: 32,
      left: 48,
    },
    xAxis: {
      type: "category",
      data: ["North", "South", "East", "West"],
      axisLabel: {
        color: "#94a3b8",
      },
      axisLine: {
        lineStyle: {
          color: "#334155",
        },
      },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        color: "#94a3b8",
      },
      splitLine: {
        lineStyle: {
          color: "rgba(148, 163, 184, 0.12)",
        },
      },
    },
    series: [
      {
        type: "bar",
        data: [42000, 31000, 28000, 52000],
      },
    ],
  },
};

const kpiWidget: WidgetState = {
  spec: {
    ...baseSpec,
    id: "kpi-widget",
    title: "Executive KPIs",
    chartType: "kpi-grid",
    dimensions: [],
    metrics: ["revenue", "orders", "aov"],
  },
  status: "done",
  kpis: [
    {
      label: "Revenue",
      value: "$128400",
      sub: "Current dataset",
      colorClass: "text-emerald-400",
      iconHint: "revenue",
    },
    {
      label: "Orders",
      value: "2431",
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
    {
      label: "Refunds",
      value: "17",
      sub: "Flagged rows",
      colorClass: "text-amber-400",
      iconHint: "warning",
    },
  ],
};

const tableWidget: WidgetState = {
  spec: {
    ...baseSpec,
    id: "table-widget",
    title: "Top Customers",
    chartType: "data-table",
    dimensions: ["customer"],
    metrics: ["revenue"],
  },
  status: "done",
  tableHeaders: ["Customer", "Region", "Revenue", "Orders"],
  tableRows: [
    ["Acme Corp", "North", "$42,000", "128"],
    ["Globex", "West", "$38,500", "103"],
    ["Initech", "South", "$31,200", "91"],
    ["Umbrella", "East", "$26,900", "77"],
    ["Stark Industries", "North", "$21,400", "64"],
  ],
};

const heatmapWidget: WidgetState = {
  spec: {
    ...baseSpec,
    id: "heatmap-widget",
    title: "Weekly Activity Heatmap",
    chartType: "heatmap",
    dimensions: ["day"],
    metrics: ["week_1", "week_2", "week_3", "week_4"],
  },
  status: "done",
  rawData: [
    { day: "Monday", week_1: 12, week_2: 18, week_3: 22, week_4: 16 },
    { day: "Tuesday", week_1: 15, week_2: 21, week_3: 28, week_4: 19 },
    { day: "Wednesday", week_1: 10, week_2: 25, week_3: 30, week_4: 24 },
    { day: "Thursday", week_1: 8, week_2: 19, week_3: 26, week_4: 20 },
    { day: "Friday", week_1: 22, week_2: 31, week_3: 35, week_4: 29 },
  ],
};

const meta = {
  title: "Src/Features/AgentCanvas/Components/WidgetRenderer",
  component: WidgetRenderer,
  tags: ["autodocs"],
  args: {
    widget: chartWidget,
    height: 280,
  },
  argTypes: {
    widget: {
      control: "object",
    },
    height: {
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
      <div className="h-[320px] w-[560px] rounded-2xl border border-slate-800 bg-slate-950 p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof WidgetRenderer>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const BarChart: Story = {
  args: {
    widget: chartWidget,
  },
};

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

export const HeatmapFromRawData: Story = {
  args: {
    widget: heatmapWidget,
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
        title: "Querying Widget",
        chartType: "line",
      },
      status: "querying",
    },
  },
};

export const Building: Story = {
  args: {
    widget: {
      spec: {
        ...baseSpec,
        id: "building-widget",
        title: "Building Widget",
        chartType: "area",
      },
      status: "building",
    },
  },
};

export const Errors: Story = {
  args: {
    widget: {
      spec: {
        ...baseSpec,
        id: "error-widget",
        title: "Broken Widget",
        chartType: "bar",
      },
      status: "error",
      error: "DuckDB query failed: column `revenue_total` does not exist.",
    },
  },
};
