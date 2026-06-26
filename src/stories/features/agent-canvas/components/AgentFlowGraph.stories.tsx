import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useAgentStore } from "@/features/agent-canvas/core/agent-store";
import type { FlowNode } from "@/features/agent-canvas/core/agent-store";

import { AgentFlowGraph } from "@/features/agent-canvas/components/AgentFlowGraph";

/**
 * AgentFlowGraph renders the LangGraph DAG via @xyflow/react, with node status
 * driven by the global agent store (falling back to a default idle graph when
 * the store is empty). Stories seed the store via a decorator. xyflow renders
 * on a canvas-like surface that is not deterministic for visual snapshots.
 */

type StoreSeed = Partial<ReturnType<typeof useAgentStore.getState>>;

const baseNodes: FlowNode[] = [
  { id: "schema", label: "Schema", status: "done", type: "schema" },
  { id: "react_sql_loop", label: "ReAct SQL", status: "done", type: "react" },
  { id: "planner", label: "Planner", status: "running", type: "plan" },
  { id: "human_interrupt", label: "Review", status: "idle", type: "gate" },
  { id: "critique", label: "Critique", status: "idle", type: "critique" },
  { id: "revise", label: "Revise", status: "idle", type: "plan" },
  { id: "sql_fan_out", label: "SQL Fan", status: "idle", type: "sql" },
  { id: "narrator", label: "Narrator", status: "idle", type: "narrate" },
];

const seedStore = (seed: StoreSeed) => {
  useAgentStore.getState().reset();
  useAgentStore.setState(seed as never);
};

const withStore = (seed: StoreSeed) => (Story: () => React.ReactElement) => {
  seedStore(seed);
  return (
    <div className="h-[640px] w-[520px] bg-slate-950">
      <Story />
    </div>
  );
};

const meta = {
  title: "Src/Features/AgentCanvas/Components/AgentFlowGraph",
  component: AgentFlowGraph,
  // @xyflow/react renders a measurement-driven flow surface, not VR-stable.
  tags: ["autodocs", "no-visual-test"],
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    withStore({
      flowNodes: baseNodes,
      running: true,
      startTime: Date.now() - 12_000,
      tokenCount: 9_120,
      toolCallCnt: 4,
    }),
  ],
} satisfies Meta<typeof AgentFlowGraph>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Empty store → component falls back to the default all-idle graph. */
export const DefaultGraph: Story = {
  decorators: [withStore({ flowNodes: [], running: false })],
};

export const Completed: Story = {
  decorators: [
    withStore({
      flowNodes: baseNodes.map((n) => ({ ...n, status: "done" })),
      running: false,
      startTime: Date.now() - 30_000,
      tokenCount: 24_000,
      toolCallCnt: 11,
    }),
  ],
};

export const WithError: Story = {
  decorators: [
    withStore({
      flowNodes: baseNodes.map((n) => (n.id === "sql_fan_out" ? { ...n, status: "error" } : n)),
      running: false,
    }),
  ],
};

export const InterruptPending: Story = {
  decorators: [
    withStore({
      flowNodes: baseNodes.map((n) =>
        n.id === "human_interrupt" ? { ...n, status: "interrupt" } : n,
      ),
      running: true,
    }),
  ],
};
