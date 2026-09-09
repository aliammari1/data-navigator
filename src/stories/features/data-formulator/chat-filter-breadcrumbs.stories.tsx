import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { type Dataset, useDataStore } from "@/core/stores/data-store";
import { ChatFilterBreadcrumbs } from "@/features/data-formulator/components/moudir-chat/chat-filter-breadcrumbs";
import {
  type ActiveFilter,
  useMoudirChatStore,
} from "@/features/data-formulator/store/moudir-chat-store";

const mockDataset: Dataset = {
  id: "ds_telecom",
  name: "telecom_transactions",
  tableName: "telecom_transactions",
  viewName: "v_telecom_transactions",
  source: "upload",
  format: "csv",
  rowCount: 24812,
  colCount: 4,
  sizeBytes: 4096,
  tags: [],
  description: "",
  createdAt: "2024-06-01T00:00:00.000Z",
  updatedAt: "2024-06-01T00:00:00.000Z",
  qualityScore: 100,
  columns: [
    { name: "canal", type: "string", nullCount: 0, distinctCount: 4, sample: ["USSD"] },
    { name: "montant", type: "number", nullCount: 0, distinctCount: 200, sample: [5000] },
    { name: "statut", type: "string", nullCount: 0, distinctCount: 2, sample: ["SUCCESS"] },
    { name: "region", type: "string", nullCount: 0, distinctCount: 10, sample: ["Littoral"] },
  ],
};

const singleFilter: ActiveFilter[] = [{ field: "canal", value: "USSD" }];

const multipleFilters: ActiveFilter[] = [
  { field: "canal", value: "USSD" },
  { field: "statut", value: "SUCCESS" },
  { field: "region", value: "Littoral" },
];

/**
 * ChatFilterBreadcrumbs displays conversational filters applied by Moudir AI or
 * Chat-with-Chart interactions, allowing granular filter inspection and removal.
 */
const meta = {
  title: "Src/Features/DataFormulator/Components/ChatFilterBreadcrumbs",
  component: ChatFilterBreadcrumbs,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: {
    showDataset: true,
  },
  decorators: [
    (Story) => {
      useDataStore.setState({
        datasets: [mockDataset],
        activeDatasetId: "ds_telecom",
      });
      return (
        <div className="w-full max-w-2xl mx-auto border border-border/40 rounded-lg overflow-hidden bg-background">
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof ChatFilterBreadcrumbs>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SingleFilter: Story = {
  play: async ({ canvasElement }) => {
    useMoudirChatStore.setState({
      activeFilters: singleFilter,
      removeFilter: fn(),
      clearFilters: fn(),
    });

    const canvas = within(canvasElement);

    // Verify dataset badge
    await expect(canvas.getByText("telecom_transactions")).toBeInTheDocument();

    // Verify filter pill
    await expect(canvas.getByText("canal:")).toBeInTheDocument();
    await expect(canvas.getByText("USSD")).toBeInTheDocument();

    // "Tout effacer" button should not be present with only 1 filter
    await expect(canvas.queryByRole("button", { name: /Tout effacer/i })).not.toBeInTheDocument();
  },
};

export const MultipleFilters: Story = {
  play: async ({ canvasElement }) => {
    useMoudirChatStore.setState({
      activeFilters: multipleFilters,
      removeFilter: fn(),
      clearFilters: fn(),
    });

    const canvas = within(canvasElement);

    // Verify all filter pills are rendered
    await expect(canvas.getByText("canal:")).toBeInTheDocument();
    await expect(canvas.getByText("statut:")).toBeInTheDocument();
    await expect(canvas.getByText("region:")).toBeInTheDocument();

    // "Tout effacer" button should be present
    await expect(canvas.getByRole("button", { name: /Tout effacer/i })).toBeInTheDocument();
  },
};

export const FilterRemoval: Story = {
  play: async ({ canvasElement }) => {
    const removeFilterMock = fn();
    useMoudirChatStore.setState({
      activeFilters: multipleFilters,
      removeFilter: removeFilterMock,
      clearFilters: fn(),
    });

    const canvas = within(canvasElement);

    // Click remove button for "canal" filter
    const removeCanalBtn = canvas.getByRole("button", {
      name: /Supprimer le filtre canal/i,
    });
    await userEvent.click(removeCanalBtn);

    expect(removeFilterMock).toHaveBeenCalledWith("canal");
  },
};

export const ClearAllFilters: Story = {
  play: async ({ canvasElement }) => {
    const clearFiltersMock = fn();
    useMoudirChatStore.setState({
      activeFilters: multipleFilters,
      removeFilter: fn(),
      clearFilters: clearFiltersMock,
    });

    const canvas = within(canvasElement);

    const clearAllBtn = canvas.getByRole("button", { name: /Tout effacer/i });
    await userEvent.click(clearAllBtn);

    expect(clearFiltersMock).toHaveBeenCalled();
  },
};

export const WithoutDataset: Story = {
  args: {
    showDataset: false,
  },
  play: async ({ canvasElement }) => {
    useMoudirChatStore.setState({
      activeFilters: multipleFilters,
      removeFilter: fn(),
      clearFilters: fn(),
    });

    const canvas = within(canvasElement);

    // Dataset badge not displayed
    await expect(canvas.queryByText("telecom_transactions")).not.toBeInTheDocument();

    // Filters still present
    await expect(canvas.getByText("canal:")).toBeInTheDocument();
    await expect(canvas.getByText("statut:")).toBeInTheDocument();
  },
};
