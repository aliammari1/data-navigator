import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import AgentCanvasScreen from "@/features/agent-canvas/screens/AgentCanvasScreen";

/**
 * AgentCanvasScreen is the full 4-panel A2UI IDE (Canvas, SQL IDE, Agent graph,
 * Narrative). It wires together Monaco, @xyflow/react, react-grid-layout, the
 * DuckDB worker, and the LangGraph pipeline — most of which require the Electron
 * runtime + a real dataset to fully come alive. In Storybook it boots into its
 * idle "setup" state from the agent store, so this is a best-effort render +
 * a11y smoke test and is opted out of visual regression.
 */
const meta = {
  title: "Src/Features/AgentCanvas/Screens/AgentCanvasScreen",
  component: AgentCanvasScreen,
  tags: ["autodocs", "no-visual-test"],
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="h-screen w-screen bg-slate-950">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AgentCanvasScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
