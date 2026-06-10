import type { Meta, StoryObj } from "@storybook/nextjs";
import { FilePlus2, Inbox } from "lucide-react";

import { AtlasEmptyState, AtlasErrorState, AtlasLoadingState } from "./states";

const meta = {
  title: "Src/Design/Blocks/States",
  component: AtlasEmptyState,
  tags: ["autodocs"],
  args: {
    title: "No datasets found",
    description: "Import a file to start exploring your data.",
  },
  argTypes: {
    title: {
      control: "text",
    },
    description: {
      control: "text",
    },
    icon: {
      control: false,
    },
    action: {
      control: false,
    },
  },
} satisfies Meta<typeof AtlasEmptyState>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const EmptyWithIcon: Story = {
  args: {
    icon: <Inbox />,
  },
};

export const EmptyWithAction: Story = {
  args: {
    icon: <FilePlus2 />,
    action: (
      <button
        type="button"
        className="rounded-(--atlas-radius-2) border border-(--atlas-border) px-3 py-1.5 text-xs font-medium text-(--atlas-text) hover:bg-(--atlas-surface-raised)"
      >
        Import dataset
      </button>
    ),
  },
};

export const Loading: Story = {
  render: () => <AtlasLoadingState label="Loading datasets…" />,
};

export const LoadingCustomLabel: Story = {
  render: () => <AtlasLoadingState label="Preparing preview…" />,
};

export const Errors: Story = {
  render: () => (
    <AtlasErrorState
      title="Import failed"
      description="The selected file could not be processed. Check the schema and try again."
    />
  ),
};

export const ErrorWithRetry: Story = {
  render: () => (
    <AtlasErrorState
      title="Connection failed"
      description="The server did not respond while loading your datasets."
      retry={() => {
        console.log("Retry clicked");
      }}
    />
  ),
};
