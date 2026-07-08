import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { CustomKPIBuilder } from "@/features/telecom/components/custom-kpi-builder";

const meta = {
  title: "Src/Features/Telecom/Components/CustomKPIBuilder",
  component: CustomKPIBuilder,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: {
    // Resolve a deterministic value so "Exécuter & Ajouter" produces a KPI card.
    runCustomKPIExpr: fn(async () => 1284),
  },
  argTypes: {
    runCustomKPIExpr: { control: false },
  },
} satisfies Meta<typeof CustomKPIBuilder>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * Clicking a quick example fills the label + SQL expression fields.
 */
export const LoadsQuickExample: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /MSISDNs Uniques/i }));
    await expect(canvas.getByLabelText(/KPI Label/i)).toHaveValue("MSISDNs Uniques");
  },
};

/**
 * Filling label + expression and running adds a KPI card via the SQL executor.
 */
export const RunsAndAddsKPI: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText(/KPI Label/i), "Tx Haute Valeur");
    await userEvent.type(
      canvas.getByLabelText(/Expression SQL/i),
      'COUNT(*) FILTER (WHERE TRY_CAST("ORIGINAL_AMOUNT" AS DOUBLE) > 1000)',
    );
    await userEvent.click(canvas.getByRole("button", { name: /Exécuter & Ajouter KPI/i }));
    await expect(args.runCustomKPIExpr).toHaveBeenCalledTimes(1);
  },
};

/**
 * The submit button stays disabled until both label and expression are present.
 */
export const SubmitDisabledWhenEmpty: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: /Exécuter & Ajouter KPI/i })).toBeDisabled();
  },
};
