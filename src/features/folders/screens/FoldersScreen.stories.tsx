import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import FoldersScreen from "./FoldersScreen";

/**
 * FoldersScreen is the dataset folder browser (organize datasets into folders,
 * move/rename, view contents). It reads from the catalog + folder store that are
 * empty in Storybook, so it renders its default empty-folder shell. This is a
 * best-effort render + a11y smoke test and is opted out of visual regression.
 */
const meta = {
  title: "Src/Features/Folders/Screens/FoldersScreen",
  component: FoldersScreen,
  tags: ["autodocs", "no-visual-test"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="h-screen w-full bg-background">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FoldersScreen>;

export default meta;

type Story = StoryObj<typeof FoldersScreen>;

export const Default: Story = {};
