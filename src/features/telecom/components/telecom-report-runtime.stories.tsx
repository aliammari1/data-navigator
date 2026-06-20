import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

// NOTE: this module's primary exports are the data-fetching context provider
// `TelecomReportRuntimeProvider` (which depends on React Query, Zustand stores,
// Next routing and a live DuckDB catalogue and therefore cannot render in
// isolation) and the `useTelecomReportRuntime` hook. The most representative
// renderable export is `TelecomLoadingPanel`, the runtime's loading state — the
// previous story imported a non-existent `TelecomReportRuntime` symbol.
import { TelecomLoadingPanel } from "./telecom-report-runtime";

const meta = {
  title: "Src/Features/Telecom/Components/TelecomLoadingPanel",
  component: TelecomLoadingPanel,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    label: "Analyse des transactions télécom…",
  },
  argTypes: {
    label: { control: "text" },
  },
} satisfies Meta<typeof TelecomLoadingPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SavingSnapshot: Story = {
  args: { label: "Sauvegarde des analytics…" },
};

export const ShowsLabel: Story = {
  args: { label: "Chargement du rapport du 2024-06-01…" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Chargement du rapport du 2024-06-01/i)).toBeVisible();
  },
};
