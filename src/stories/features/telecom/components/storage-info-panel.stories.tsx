import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StorageInfoPanel } from "@/features/telecom/components/storage-info-panel";

/**
 * `StorageInfoPanel` reads live browser Storage metrics and the local DuckDB
 * catalogue on mount. In Storybook those APIs resolve against the sandbox, so
 * the panel renders its real loading/loaded states; props only point it at an
 * optional active dataset.
 */
const meta = {
  title: "Src/Features/Telecom/Components/StorageInfoPanel",
  component: StorageInfoPanel,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    datasetId: "telecom_2024_06_01",
  },
  argTypes: {
    datasetId: { control: "text" },
    tableName: { control: "text" },
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 560, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StorageInfoPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WithActiveDataset: Story = {};

export const LegacyTableName: Story = {
  args: {
    datasetId: null,
    tableName: "telecom_legacy_table",
  },
};

export const NoActiveDataset: Story = {
  args: {
    datasetId: null,
    tableName: null,
  },
};
