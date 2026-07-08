import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type {
  AgentPhase,
  AgentThought,
  DashboardPlan,
  WidgetSpec,
  WidgetState,
} from "@/features/agent-canvas/core/types";
import { AgentPanel } from "@/features/agent-canvas/components/AgentPanel";

const widgetSpecs: WidgetSpec[] = [
  {
    id: "revenue-kpi",
    title: "Revenue Summary",
    chartType: "kpi-grid",
    sqlIntent: "Calculate total revenue, average order value, and order count.",
    dimensions: [],
    metrics: ["revenue", "order_count"],
    position: {
      x: 0,
      y: 0,
      w: 6,
      h: 2,
    },
    reasoning: "A KPI grid gives a fast overview of the most important business metrics.",
  },
  {
    id: "sales-trend",
    title: "Sales Trend",
    chartType: "line",
    sqlIntent: "Aggregate revenue by month to show sales evolution over time.",
    dimensions: ["order_date"],
    metrics: ["revenue"],
    position: {
      x: 0,
      y: 2,
      w: 8,
      h: 4,
    },
    reasoning: "A line chart is best for showing how revenue changes across time.",
  },
  {
    id: "region-breakdown",
    title: "Revenue by Region",
    chartType: "bar",
    sqlIntent: "Group total revenue by region and sort by revenue descending.",
    dimensions: ["region"],
    metrics: ["revenue"],
    position: {
      x: 8,
      y: 2,
      w: 4,
      h: 4,
    },
    reasoning: "A bar chart makes category comparison easy to scan.",
  },
];

const thoughts: AgentThought[] = [
  {
    id: "thought-1",
    agent: "planner",
    kind: "think",
    text: "Loading the local model and preparing the dashboard pipeline.",
    ts: Date.now() - 9000,
  },
  {
    id: "thought-2",
    agent: "schema-analyzer",
    kind: "plan",
    text: "Detected revenue, region, and order date as useful dashboard fields.",
    ts: Date.now() - 6000,
  },
  {
    id: "thought-3",
    agent: "sql-builder",
    kind: "sql",
    text: "Preparing aggregation queries for KPI and trend widgets.",
    ts: Date.now() - 3000,
  },
  {
    id: "thought-4",
    agent: "chart-builder",
    kind: "chart",
    text: "Building visual widgets from query results.",
    ts: Date.now() - 1000,
  },
];

const plan: DashboardPlan = {
  title: "Sales Performance Dashboard",
  description: "Overview of revenue, order volume, and regional sales performance.",
  widgets: widgetSpecs,
};

const widgets: WidgetState[] = [
  {
    spec: widgetSpecs[0],
    status: "done",
    sql: "select sum(revenue) as total_revenue, count(*) as order_count from orders",
    kpis: [
      {
        label: "Total Revenue",
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
    ],
    insight: "Revenue is concentrated in a small number of high-value orders.",
  },
  {
    spec: widgetSpecs[1],
    status: "building",
    sql: "select date_trunc('month', order_date) as month, sum(revenue) as revenue from orders group by month order by month",
  },
  {
    spec: widgetSpecs[2],
    status: "pending",
  },
];

const meta = {
  title: "Src/Features/AgentCanvas/Components/AgentPanel",
  component: AgentPanel,
  tags: ["autodocs"],
  args: {
    phase: "build",
    thoughts,
    plan,
    widgets,
  },
  argTypes: {
    phase: {
      control: "select",
      options: [
        "idle",
        "model-load",
        "schema",
        "plan",
        "build",
        "done",
        "error",
      ] satisfies AgentPhase[],
    },
    thoughts: {
      control: "object",
    },
    plan: {
      control: "object",
    },
    widgets: {
      control: "object",
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
      <div className="w-[380px] min-h-[560px] bg-slate-950 p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AgentPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Idle: Story = {
  args: {
    phase: "idle",
    thoughts: [],
    plan: undefined,
    widgets: [],
  },
};

export const ModelLoad: Story = {
  args: {
    phase: "model-load",
    thoughts: [
      {
        id: "thought-model-load",
        agent: "runtime",
        kind: "think",
        text: "Loading the selected local LLM model.",
        ts: Date.now() - 2000,
      },
    ],
    plan: undefined,
    widgets: [],
  },
};

export const SchemaAnalysis: Story = {
  args: {
    phase: "schema",
    thoughts: [
      {
        id: "thought-schema-1",
        agent: "schema-analyzer",
        kind: "think",
        text: "Inspecting table columns and profiling data types.",
        ts: Date.now() - 5000,
      },
      {
        id: "thought-schema-2",
        agent: "schema-analyzer",
        kind: "ok",
        text: "Detected 3 metrics, 2 dimensions, and 1 time dimension.",
        ts: Date.now() - 2000,
      },
    ],
    plan: undefined,
    widgets: [],
  },
};

export const Planning: Story = {
  args: {
    phase: "plan",
    thoughts: [
      {
        id: "thought-plan-1",
        agent: "planner",
        kind: "plan",
        text: "Choosing charts that match the available dimensions and metrics.",
        ts: Date.now() - 5000,
      },
      {
        id: "thought-plan-2",
        agent: "planner",
        kind: "ok",
        text: "Dashboard plan generated with 3 widgets.",
        ts: Date.now() - 1000,
      },
    ],
    plan,
    widgets: [],
  },
};

export const Building: Story = {
  args: {
    phase: "build",
    thoughts,
    plan,
    widgets,
  },
};

export const Complete: Story = {
  args: {
    phase: "done",
    thoughts: [
      ...thoughts,
      {
        id: "thought-complete",
        agent: "pipeline",
        kind: "ok",
        text: "All widgets were built successfully.",
        ts: Date.now(),
      },
    ],
    plan,
    widgets: widgetSpecs.map((spec) => ({
      spec,
      status: "done",
      insight: `${spec.title} generated successfully.`,
    })),
  },
};

export const WithWidgetError: Story = {
  args: {
    phase: "error",
    thoughts: [
      ...thoughts,
      {
        id: "thought-error",
        agent: "chart-builder",
        kind: "err",
        text: "Could not build the Revenue by Region widget.",
        ts: Date.now(),
      },
    ],
    plan,
    widgets: [
      {
        spec: widgetSpecs[0],
        status: "done",
      },
      {
        spec: widgetSpecs[1],
        status: "done",
      },
      {
        spec: widgetSpecs[2],
        status: "error",
        error: "Missing column: region",
      },
    ],
  },
};

export const QueryingWidgets: Story = {
  args: {
    phase: "build",
    thoughts: [
      {
        id: "thought-querying",
        agent: "sql-builder",
        kind: "exec",
        text: "Executing SQL queries for generated widgets.",
        ts: Date.now() - 1000,
      },
    ],
    plan,
    widgets: widgetSpecs.map((spec) => ({
      spec,
      status: "querying",
    })),
  },
};
