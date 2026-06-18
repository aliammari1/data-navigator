import type { Meta, StoryObj } from "@storybook/nextjs";

import AiAnalysisScreen from "./AiAnalysisScreen";

/**
 * AiAnalysisScreen is the full ML/insights workspace (anomalies, correlations,
 * forecasts, clustering) over the active dataset. It reads from the DuckDB
 * catalog + TF.js worker that are not present in Storybook, so it boots into its
 * idle state. This is a best-effort render + a11y smoke test and is opted out of
 * visual regression.
 */
const meta = {
  title: "Src/Features/AiAnalysis/Screens/AiAnalysisScreen",
  component: AiAnalysisScreen,
  tags: ["autodocs", "no-visual-test"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="h-screen w-full bg-background">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AiAnalysisScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
