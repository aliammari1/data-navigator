import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { AgentThought } from "@/features/agent-canvas/core/types";
import { ThoughtStream } from "./ThoughtStream";

const now = Date.now();

const demoThoughts: AgentThought[] = [
  {
    id: "thought-1",
    agent: "runtime",
    kind: "think",
    text: "Starting local agent pipeline.",
    ts: now - 9000,
  },
  {
    id: "thought-2",
    agent: "schema-analyzer",
    kind: "plan",
    text: "Inspecting columns and detecting useful dimensions.",
    ts: now - 8000,
  },
  {
    id: "thought-3",
    agent: "sql-builder",
    kind: "sql",
    text: "SELECT region, SUM(revenue) AS revenue FROM sales GROUP BY region ORDER BY revenue DESC;",
    ts: now - 7000,
  },
  {
    id: "thought-4",
    agent: "duckdb",
    kind: "exec",
    text: "Query executed in 42ms.",
    ts: now - 6000,
  },
  {
    id: "thought-5",
    agent: "chart-builder",
    kind: "chart",
    text: "Generated bar chart for revenue by region.",
    ts: now - 5000,
  },
  {
    id: "thought-6",
    agent: "insight-engine",
    kind: "insight",
    text: "North region contributes the largest share of total revenue.",
    ts: now - 4000,
  },
  {
    id: "thought-7",
    agent: "pipeline",
    kind: "ok",
    text: "Dashboard plan completed successfully.",
    ts: now - 3000,
  },
];

const meta = {
  title: "Src/Features/AgentCanvas/Components/ThoughtStream",
  component: ThoughtStream,
  tags: ["autodocs"],
  args: {
    thoughts: demoThoughts,
    className: "h-[320px]",
  },
  argTypes: {
    thoughts: {
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
      <div className="w-[520px] rounded-2xl border border-slate-800 bg-slate-950 p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ThoughtStream>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: {
    thoughts: [],
  },
};

export const WithWarning: Story = {
  args: {
    thoughts: [
      ...demoThoughts,
      {
        id: "thought-warn",
        agent: "validator",
        kind: "warn",
        text: "Some rows contain missing values and may affect chart accuracy.",
        ts: now - 2000,
      },
    ],
  },
};

export const WithError: Story = {
  args: {
    thoughts: [
      ...demoThoughts,
      {
        id: "thought-error",
        agent: "duckdb",
        kind: "err",
        text: "Query failed: column `revenue_total` does not exist.",
        ts: now - 1000,
      },
    ],
  },
};

export const LongStream: Story = {
  args: {
    thoughts: Array.from({ length: 32 }, (_, index): AgentThought => {
      const kinds = [
        "think",
        "plan",
        "sql",
        "exec",
        "chart",
        "insight",
        "ok",
        "warn",
        "err",
      ] as const;

      const kind = kinds[index % kinds.length];

      return {
        id: `thought-long-${index}`,
        agent: index % 2 === 0 ? "planner" : "executor",
        kind,
        text:
          kind === "sql"
            ? `SELECT * FROM sales WHERE row_id = ${index};`
            : `Pipeline message number ${index + 1}.`,
        ts: now - (32 - index) * 1000,
      };
    }),
  },
};

export const MultilineThought: Story = {
  args: {
    thoughts: [
      {
        id: "thought-multiline",
        agent: "sql-builder",
        kind: "sql",
        text: `SELECT
  region,
  SUM(revenue) AS total_revenue,
  COUNT(*) AS order_count
FROM sales
GROUP BY region
ORDER BY total_revenue DESC;`,
        ts: now,
      },
    ],
  },
};
