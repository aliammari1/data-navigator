import type { Meta, StoryObj } from "@storybook/nextjs";
import { expect, userEvent, within } from "storybook/test";

import type { SeriesPoint } from "../core/forecast-engine";
import { ForecastPanel } from "./forecast-panel";

/**
 * Realistic seasonal telecom series: ~12 weeks of daily transaction volume with
 * a weekly cycle (weekend dip), a gentle upward trend, a month-end bump, and a
 * single injected spike so the residual-anomaly marker is exercised.
 *
 * Generated deterministically (seeded LCG) so stories render identically across
 * runs — important for visual-regression and a11y snapshots.
 */
function seededSeries(days = 84): SeriesPoint[] {
  let seed = 1337;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const base = 11_000;
  const start = new Date("2026-03-01T00:00:00Z").getTime();
  const out: SeriesPoint[] = [];

  for (let i = 0; i < days; i++) {
    const date = new Date(start + i * 86_400_000);
    const dow = date.getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    const dayOfMonth = date.getUTCDate();
    const monthEnd = dayOfMonth >= 28 ? 1.1 : 1;
    const weekend = isWeekend ? 0.8 : 1;
    const trend = 1 + i * 0.0025;
    const noise = 0.96 + rand() * 0.08;
    let value = base * weekend * monthEnd * trend * noise;
    // Inject a clear spike mid-series to surface an anomaly marker.
    if (i === 40) value *= 1.6;
    out.push({ date: date.toISOString().slice(0, 10), value: Math.round(value) });
  }
  return out;
}

const SERIES = seededSeries();

const meta = {
  title: "Src/Features/ForecastIntelligence/ForecastPanel",
  component: ForecastPanel,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: {
    series: SERIES,
    metricLabel: "Transaction volume",
    unit: "tx",
    defaultHorizon: 7,
    seasonLength: 7,
    // Keep stories headless and synchronous — the Pyodide sandbox needs a worker
    // that isn't available in the Storybook test environment.
    enablePyodide: false,
  },
  argTypes: {
    series: { control: false },
    defaultHorizon: { control: "select", options: [7, 14, 30] },
    seasonLength: { control: "number" },
    enablePyodide: { control: false },
  },
} satisfies Meta<typeof ForecastPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Full panel with seasonal data, a backtest, and an anomaly marker. */
export const Default: Story = {};

/** Longer horizon shows the confidence band widening with √h. */
export const LongHorizon: Story = {
  args: { defaultHorizon: 30 },
};

/** Revenue framing reuses the same engine with a different unit/label. */
export const RevenueMetric: Story = {
  args: {
    metricLabel: "Daily revenue",
    unit: "TND",
    series: SERIES.map((p) => ({ ...p, value: Math.round(p.value * 42.5) })),
  },
};

/** Empty state when there is not enough data to forecast. */
export const Empty: Story = {
  args: { series: [{ date: "2026-06-01", value: 1000 }] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(/not enough data to forecast/i),
    ).toBeInTheDocument();
  },
};

/** Short, constant series → simplified (degraded) model, flat band. */
export const ConstantSeries: Story = {
  args: {
    series: Array.from({ length: 10 }, (_, i) => ({
      date: `2026-05-${String(i + 1).padStart(2, "0")}`,
      value: 5000,
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/simplified model/i)).toBeInTheDocument();
  },
};

/** Interaction: switching the horizon updates the active control. */
export const SwitchHorizon: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const btn30 = canvas.getByRole("button", { name: "30d" });
    await userEvent.click(btn30);
    await expect(btn30).toHaveAttribute("aria-pressed", "true");
  },
};
