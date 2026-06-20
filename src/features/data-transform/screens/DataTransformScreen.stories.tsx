import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import DataTransformScreen from "./DataTransformScreen";

/**
 * DataTransformScreen is the transform pipeline builder (filter, derive, join,
 * aggregate, pivot steps over the active dataset). It compiles the pipeline to a
 * single read-only DuckDB CTE, profiles columns via SUMMARIZE, generates recipes
 * from natural language with the offline AI provider (grammar-constrained),
 * persists recipes to Dexie, validates SQL offline (node-sql-parser worker), and
 * exports the result as CSV / XLSX (off-main-thread). It depends on the DuckDB
 * worker + AI provider that are not present in Storybook, so it renders its empty
 * pipeline shell. This is a best-effort render + a11y smoke test and is opted out
 * of visual regression.
 */
const meta = {
  title: "Src/Features/DataTransform/Screens/DataTransformScreen",
  component: DataTransformScreen,
  tags: ["autodocs", "no-visual-test"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="h-screen w-full bg-background">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DataTransformScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
