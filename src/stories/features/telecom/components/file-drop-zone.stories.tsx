import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within } from "storybook/test";

import { FileDropZone } from "@/features/telecom/components/file-drop-zone";

const meta = {
  title: "Src/Features/Telecom/Components/FileDropZone",
  component: FileDropZone,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: {
    onLoad: fn(async () => {}),
    defaultMode: "replace",
    canAppend: false,
  },
  argTypes: {
    defaultMode: {
      control: "inline-radio",
      options: ["replace", "append", "replace-active"],
    },
    canAppend: { control: "boolean" },
    onLoad: { control: false },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 520 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FileDropZone>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The upload affordance is present before any file is queued.
    await expect(canvas.getByText(/gliss|dépos|upload|fichier/i)).toBeInTheDocument();
  },
};

/**
 * When appending to a period is allowed, the "Ajouter" mode becomes selectable
 * once files are queued.
 */
export const AppendEnabled: Story = {
  args: {
    canAppend: true,
    defaultMode: "append",
  },
};

export const ReplaceActiveDefault: Story = {
  args: {
    defaultMode: "replace-active",
  },
};
