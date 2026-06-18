import type { Meta, StoryObj } from "@storybook/nextjs";
import { expect, fn, userEvent, within } from "storybook/test";
import { useAgentStore } from "@/features/agent-canvas/core/agent-store";
import type { AGUIEvent } from "@/features/agent-canvas/core/ag-ui-types";

import { TopBar } from "./TopBar";

/**
 * TopBar reads everything (phase, model, ticker, stats) from the global
 * zustand agent store. Stories seed that store through a decorator so the
 * rendered state is deterministic, then exercise the optional `onReset`
 * callback via the `play` interaction test.
 */

type StoreSeed = Partial<ReturnType<typeof useAgentStore.getState>>;

const buildTicker = (): AGUIEvent[] =>
  [
    { type: "RUN_STARTED", messageId: "m1" },
    { type: "STEP_STARTED", messageId: "m2", nodeName: "schema" },
    { type: "TOOL_CALL_START", messageId: "m3", toolName: "duckdb_query" },
    { type: "TOOL_CALL_END", messageId: "m4" },
    { type: "STEP_FINISHED", messageId: "m5" },
    { type: "TEXT_MESSAGE_CONTENT", messageId: "m6", delta: "Revenue grew 12% MoM" },
  ] as unknown as AGUIEvent[];

const seedStore = (seed: StoreSeed) => {
  useAgentStore.getState().reset();
  useAgentStore.setState(seed as never);
};

const withStore = (seed: StoreSeed) => (Story: () => React.ReactElement) => {
  seedStore(seed);
  return (
    <div className="w-[760px] bg-slate-950">
      <Story />
    </div>
  );
};

const meta = {
  title: "Src/Features/AgentCanvas/Components/TopBar",
  component: TopBar,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    onReset: fn(),
  },
  argTypes: {
    onReset: { control: false },
  },
  decorators: [
    withStore({
      phase: "build",
      model: "HuggingFaceTB/SmolLM2-1.7B-Instruct",
      threadId: "thread-abc12345",
      running: true,
      startTime: Date.now() - 42_000,
      tokenCount: 18_240,
      toolCallCnt: 7,
      eventTicker: buildTicker(),
    }),
  ],
} satisfies Meta<typeof TopBar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Idle: Story = {
  decorators: [
    withStore({
      phase: "idle",
      model: "HuggingFaceTB/SmolLM2-360M-Instruct",
      running: false,
      eventTicker: [],
      tokenCount: 0,
      toolCallCnt: 0,
    }),
  ],
};

export const Planning: Story = {
  decorators: [
    withStore({
      phase: "plan",
      model: "Qwen/Qwen2.5-0.5B-Instruct",
      threadId: "thread-plan9999",
      running: true,
      startTime: Date.now() - 8_000,
      tokenCount: 3_120,
      toolCallCnt: 2,
      eventTicker: buildTicker().slice(0, 3),
    }),
  ],
};

export const ErrorPhase: Story = {
  decorators: [
    withStore({
      phase: "error",
      model: "HuggingFaceTB/SmolLM2-1.7B-Instruct",
      threadId: "thread-fail0001",
      running: false,
      error: "Pipeline failed during build phase",
      eventTicker: [
        { type: "RUN_ERROR", messageId: "e1" },
      ] as unknown as AGUIEvent[],
    }),
  ],
};

export const ResetFiresOnClick: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const reset = canvas.getByRole("button", { name: /reset/i });
    await userEvent.click(reset);
    await expect(args.onReset).toHaveBeenCalledTimes(1);
  },
};
