import type { Meta, StoryObj } from "@storybook/nextjs";

import CsvParserScreen from "./CsvParserScreen";

/**
 * CsvParserScreen is the CSV ingest + preview workspace (drop a file, configure
 * delimiters/types, preview parsed rows). It relies on the file-system bridge and
 * DuckDB ingest that are not available in Storybook, so it boots into its empty
 * "drop a file" state. This is a best-effort render + a11y smoke test and is
 * opted out of visual regression.
 */
const meta = {
  title: "Src/Features/CsvParser/Screens/CsvParserScreen",
  component: CsvParserScreen,
  tags: ["autodocs", "no-visual-test"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="h-screen w-full bg-background">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CsvParserScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
