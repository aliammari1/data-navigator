import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import LineageScreen from "@/features/lineage/screens/LineageScreen";

/**
 * LineageScreen is the data-lineage graph workspace (sources → transforms →
 * outputs as a DAG). It builds its graph from the lineage store + dataset
 * catalog that are empty in Storybook, so it renders its default/empty graph
 * shell. This is a best-effort render + a11y smoke test and is opted out of
 * visual regression.
 */
const meta = {
  title: "Src/Features/Lineage/Screens/LineageScreen",
  component: LineageScreen,
  tags: ["autodocs", "no-visual-test"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="h-screen w-full bg-background">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LineageScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
