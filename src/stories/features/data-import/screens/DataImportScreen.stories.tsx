import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import DataImportScreen from "@/features/data-import/screens/DataImportScreen";

/**
 * DataImportScreen is the multi-format import wizard (choose a source, map
 * columns, register a dataset). It depends on the Electron file bridge + DuckDB
 * registration that are not present in Storybook, so it renders its initial
 * source-selection step. This is a best-effort render + a11y smoke test and is
 * opted out of visual regression.
 */
const meta = {
  title: "Src/Features/DataImport/Screens/DataImportScreen",
  component: DataImportScreen,
  tags: ["autodocs", "no-visual-test"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="h-screen w-full bg-background">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DataImportScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
