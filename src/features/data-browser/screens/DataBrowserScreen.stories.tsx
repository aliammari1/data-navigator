import type { Meta, StoryObj } from "@storybook/nextjs";

import DataBrowserScreen from "./DataBrowserScreen";

/**
 * DataBrowserScreen is the virtualized, filterable grid over the active DuckDB
 * dataset (table / cards / charts / SQL views) with a row-detail drawer. It
 * queries DuckDB directly via the platform API and opens the first catalogued
 * dataset by default, so the only prop is an optional `tableName` deep-link.
 *
 * In Storybook DuckDB is not available, so this is a best-effort render + a11y
 * smoke test and is opted out of visual regression.
 */
const meta = {
  title: "Src/Features/DataBrowser/Screens/DataBrowserScreen",
  component: DataBrowserScreen,
  tags: ["autodocs", "no-visual-test"],
  parameters: { layout: "fullscreen" },
  args: {
    tableName: "",
  },
  argTypes: {
    tableName: { control: "text" },
  },
  decorators: [
    (Story) => (
      <div className="h-screen w-full bg-background">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DataBrowserScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const DeepLinkedDataset: Story = {
  args: {
    tableName: "ds_example_view",
  },
};
