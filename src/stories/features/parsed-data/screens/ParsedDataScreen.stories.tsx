import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import ParsedDataScreen from "@/features/parsed-data/screens/ParsedDataScreen";

/**
 * ParsedDataScreen is the data-profiling workspace (column profiles, quality
 * rings, distributions over a parsed dataset). It profiles data via the DuckDB
 * worker that is not present in Storybook, so it renders its default/empty
 * profiling shell. This is a best-effort render + a11y smoke test and is opted
 * out of visual regression.
 */
const meta = {
  title: "Src/Features/ParsedData/Screens/ParsedDataScreen",
  component: ParsedDataScreen,
  tags: ["autodocs", "no-visual-test"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="h-screen w-full bg-background">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ParsedDataScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
