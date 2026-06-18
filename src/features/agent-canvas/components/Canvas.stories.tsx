import type { Meta, StoryObj } from "@storybook/nextjs";
import { expect, within } from "storybook/test";
import { useAgentStore } from "@/features/agent-canvas/core/agent-store";
import type { WidgetSpec, WidgetState } from "@/features/agent-canvas/core/types";

import { Canvas } from "./Canvas";

/**
 * Canvas is a react-grid-layout drag/resize surface that renders the widgets
 * held in the global agent store. With no widgets it shows an empty / loading
 * state. Stories seed the store via a decorator. The grid + chart libraries are
 * measurement-driven, so this is excluded from visual snapshots.
 */

type StoreSeed = Partial<ReturnType<typeof useAgentStore.getState>>;

const specs: WidgetSpec[] = [
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
    id: "region-breakdown",
    title: "Revenue by Region",
    chartType: "bar",
    sqlIntent: "Revenue grouped by region.",
    dimensions: ["region"],
    metrics: ["revenue"],
    position: { x: 6, y: 0, w: 6, h: 4 },
  },
];

const widgets: WidgetState[] = [
  {
    spec: specs[0],
    status: "done",
    kpis: [
      {
        label: "Total Revenue",
        value: "$1.28M",
        sub: "Current dataset",
        colorClass: "text-emerald-400",
        iconHint: "revenue",
      },
    ],
    insight: "Revenue concentrated in the North region.",
  },
  {
    spec: specs[1],
    status: "done",
    rawData: [
      { region: "North", revenue: 486000 },
      { region: "South", revenue: 312000 },
      { region: "East", revenue: 281000 },
      { region: "West", revenue: 201000 },
    ],
    echartsOption: {
      xAxis: { type: "category", data: ["North", "South", "East", "West"] },
      yAxis: { type: "value" },
      series: [{ type: "bar", data: [486000, 312000, 281000, 201000] }],
    },
  },
];

const seedStore = (seed: StoreSeed) => {
  useAgentStore.getState().reset();
  useAgentStore.setState(seed as never);
};

const withStore = (seed: StoreSeed) => (Story: () => React.ReactElement) => {
  seedStore(seed);
  return (
    <div className="h-[560px] w-[960px] bg-slate-950 p-2">
      <Story />
    </div>
  );
};

const meta = {
  title: "Src/Features/AgentCanvas/Components/Canvas",
  component: Canvas,
  // react-grid-layout depends on runtime width measurement + chart libs.
  tags: ["autodocs", "no-visual-test"],
  parameters: {
    layout: "fullscreen",
  },
  decorators: [withStore({ widgets, running: false })],
} satisfies Meta<typeof Canvas>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const EmptyIdle: Story = {
  decorators: [withStore({ widgets: [], running: false })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/canvas is empty/i)).toBeInTheDocument();
  },
};

export const EmptyRunning: Story = {
  decorators: [withStore({ widgets: [], running: true })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(/agent building widgets/i),
    ).toBeInTheDocument();
  },
};
