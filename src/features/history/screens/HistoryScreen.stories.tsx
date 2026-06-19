import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import HistoryScreen from "./HistoryScreen";

/**
 * HistoryScreen is the workspace activity timeline: a durable, virtualized,
 * searchable, exportable feed merged from the datasets, transforms, query-history
 * and activity stores. Those stores are empty in Storybook, so it renders its
 * empty-timeline shell. Best-effort render + a11y smoke test; opted out of visual
 * regression.
 */
const meta = {
  title: "Src/Features/History/Screens/HistoryScreen",
  component: HistoryScreen,
  tags: ["autodocs", "no-visual-test"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="h-screen w-full bg-background">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HistoryScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
