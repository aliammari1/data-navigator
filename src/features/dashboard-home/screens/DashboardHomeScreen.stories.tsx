import type { Meta, StoryObj } from "@storybook/nextjs";

import DashboardHomeScreen from "./DashboardHomeScreen";

/**
 * DashboardHomeScreen is the landing dashboard (recent datasets, quick actions,
 * activity). It reads from the dataset catalog + recent-activity stores that are
 * empty in Storybook, so it renders its default/empty home shell. This is a
 * best-effort render + a11y smoke test and is opted out of visual regression.
 */
const meta = {
  title: "Src/Features/DashboardHome/Screens/DashboardHomeScreen",
  component: DashboardHomeScreen,
  tags: ["autodocs", "no-visual-test"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="h-screen w-full bg-background">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DashboardHomeScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
