import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { useAgentStore } from "@/features/agent-canvas/core/agent-store";
import type { TraceNode } from "@/features/agent-canvas/core/event-bus";
import type { DashboardPlan } from "@/features/agent-canvas/core/types";

import { NarrativePanel } from "./NarrativePanel";

/**
 * NarrativePanel is a tabbed panel (Summary / Review / Trace) that reads the
 * executive narrative, the HITL plan, and the LangSmith trace tree from the
 * global agent store. Stories seed the store via a decorator and the `play`
 * tests drive the tab switching. The Monaco editor is loaded dynamically, so
 * this panel is excluded from visual snapshots.
 */

type StoreSeed = Partial<ReturnType<typeof useAgentStore.getState>>;

const NARRATIVE = `# Executive Summary

Revenue grew **12.4%** month over month, driven primarily by the North region.

- Total revenue: **$1.28M**
- Top region: **North** (38% of revenue)
- Average order value up **5.1%**

Recommend doubling down on North-region acquisition spend.`;

const plan: DashboardPlan = {
  title: "Sales Performance Dashboard",
  description: "Revenue, order volume, and regional performance.",
  widgets: [
    {
      id: "revenue-kpi",
      title: "Revenue Summary",
      chartType: "kpi-grid",
      sqlIntent: "Total revenue, AOV, order count.",
      dimensions: [],
      metrics: ["revenue"],
      position: { x: 0, y: 0, w: 6, h: 2 },
    },
    {
      id: "sales-trend",
      title: "Sales Trend",
      chartType: "line",
      sqlIntent: "Revenue by month.",
      dimensions: ["order_date"],
      metrics: ["revenue"],
      position: { x: 0, y: 2, w: 8, h: 4 },
    },
    {
      id: "region-breakdown",
      title: "Revenue by Region",
      chartType: "bar",
      sqlIntent: "Revenue grouped by region.",
      dimensions: ["region"],
      metrics: ["revenue"],
      position: { x: 8, y: 2, w: 4, h: 4 },
    },
  ],
};

const traceRoots: TraceNode[] = [
  {
    id: "root",
    name: "runPipeline",
    type: "node",
    status: "done",
    duration: 8420,
    output: "3 widgets built",
    children: [
      {
        id: "schema",
        name: "schema_analyzer",
        type: "node",
        status: "done",
        duration: 1200,
        children: [],
      },
      {
        id: "planner",
        name: "planner_llm",
        type: "llm",
        status: "done",
        duration: 3100,
        output: "plan with 3 widgets",
        children: [
          {
            id: "sql",
            name: "duckdb_query",
            type: "tool",
            status: "done",
            duration: 42,
            children: [],
          },
        ],
      },
    ],
  },
] as unknown as TraceNode[];

const seedStore = (seed: StoreSeed) => {
  useAgentStore.getState().reset();
  useAgentStore.setState(seed as never);
};

const withStore = (seed: StoreSeed) => (Story: () => React.ReactElement) => {
  seedStore(seed);
  return (
    <div className="h-[520px] w-[420px] bg-slate-950">
      <Story />
    </div>
  );
};

const meta = {
  title: "Src/Features/AgentCanvas/Components/NarrativePanel",
  component: NarrativePanel,
  // Monaco editor + animated tabs do not render deterministically for VR.
  tags: ["autodocs", "no-visual-test"],
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    withStore({
      narrative: NARRATIVE,
      plan,
      traceRoots,
    }),
  ],
} satisfies Meta<typeof NarrativePanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  decorators: [
    withStore({
      narrative: undefined,
      plan: undefined,
      traceRoots: [],
    }),
  ],
};

export const ReviewTab: Story = {
  decorators: [
    withStore({
      plan,
      interrupt: {
        active: true,
        reason: "Plan ready — reorder widgets and approve to build.",
        payload: null,
        resolve: () => {},
      },
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /review/i }));
    await expect(canvas.getByText(/widget order/i)).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /approve & build/i })).toBeInTheDocument();
  },
};

export const TraceTab: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /trace/i }));
    await expect(canvas.getByText("runPipeline")).toBeInTheDocument();
  },
};
