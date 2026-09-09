import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";

import HelpScreen from "@/features/help/screens/HelpScreen";

/**
 * HelpScreen is the in-app help center (searchable features, FAQ, and keyboard
 * shortcuts). Search is fuzzy (fuse.js) and typo-tolerant; section tabs switch
 * between Features / FAQ / Shortcuts. Feedback is captured locally via Dexie /
 * IndexedDB — nothing leaves the device. The `play` tests drive the section
 * tabs, the fuzzy search filter, and the local feedback form.
 */
const meta = {
  title: "Src/Features/Help/Screens/HelpScreen",
  component: HelpScreen,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="flex h-screen w-full flex-col bg-background">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HelpScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const FaqSection: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /faq/i }));
  },
};

export const ShortcutsSection: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /shortcuts/i }));
  },
};

export const Search: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const search = canvas.getByRole("searchbox", { name: /search help/i });
    // Intentionally misspelled to exercise fuse.js typo tolerance.
    await userEvent.type(search, "uplaod");
    await expect(search).toHaveValue("uplaod");
    await expect(await canvas.findByRole("button", { name: /Upload/i })).toBeInTheDocument();
  },
};

export const LocalFeedback: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const feedback = canvas.getByPlaceholderText(/describe the issue or idea/i);
    await userEvent.type(feedback, "The lineage graph could use a legend.");
    const save = canvas.getByRole("button", { name: /save feedback/i });
    await expect(save).toBeEnabled();
    await userEvent.click(save);
    // Message clears once the entry is persisted locally.
    await expect(feedback).toHaveValue("");
  },
};

/**
 * Starts the global guided tour and asserts the driver.js popover renders.
 * driver.js mounts its popover on `document.body`, so we assert against the
 * document, not the story canvas. The first step is anchor-less ("Welcome"),
 * so it shows regardless of which dashboard anchors exist in Storybook.
 */
export const GuidedTour: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const screen = within(document.body);
    const start = canvas.getByRole("button", { name: /^start$/i });
    await userEvent.click(start);
    await expect(await screen.findByText(/Welcome to DataNavigator/i)).toBeInTheDocument();
  },
};
