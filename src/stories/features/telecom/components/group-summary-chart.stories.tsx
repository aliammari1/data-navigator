import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { GroupSummaryChart } from "@/features/telecom/components/group-summary-chart";
import type { ChannelGroup } from "@/features/telecom/lib/canal-groups";
import type { ChannelDef } from "@/features/telecom/lib/report-engine";

const ch = (name: string): ChannelDef => ({
  name,
  condition: `SERVICE_CODE = '${name}'`,
});

const groups: ChannelGroup[] = [
  { label: "Paiement facture", channels: [ch("IZIPAY"), ch("SMT")], color: "#6366f1" },
  { label: "Recharge voix", channels: [ch("TTCASH"), ch("VOUCHER")], color: "#10b981" },
  { label: "Data", channels: [ch("SABBA"), ch("EVOUCHER")], color: "#f59e0b" },
  { label: "Transfert crédit", channels: [ch("CREDIT_TRANSFER")], color: "#06b6d4" },
];

// Deterministic stand-in for the DuckDB-backed fetcher: resolves realistic
// per-group totals so the chart renders without a database.
const totalsByGroup: Record<string, { nombre: number; montant: number }> = {
  IZIPAY: { nombre: 12_400, montant: 248_100 },
  TTCASH: { nombre: 8_100, montant: 121_500 },
  SABBA: { nombre: 4_300, montant: 64_500 },
  CREDIT_TRANSFER: { nombre: 2_050, montant: 30_750 },
};

const makeFetcher =
  (overrides?: Partial<Record<string, { nombre: number; montant: number }>>) =>
  async (channels: ChannelDef[]) => {
    const key = channels[0]?.name ?? "";
    const t = { ...totalsByGroup, ...overrides }[key] ?? {
      nombre: 1_000,
      montant: 15_000,
    };
    return {
      rows: channels.map((c) => ({ canal: c.name, nombre: t.nombre, montant: t.montant })),
      total: { canal: key, nombre: t.nombre, montant: t.montant },
    };
  };

const meta = {
  title: "Src/Features/Telecom/Components/GroupSummaryChart",
  component: GroupSummaryChart,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    groups,
    dateFrom: "2024-06-01",
    dateTo: "2024-06-01",
    fetchSpecChannelStats: makeFetcher(),
  },
  argTypes: {
    groups: { control: false },
    fetchSpecChannelStats: { control: false },
    dateFrom: { control: "text" },
    dateTo: { control: "text" },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 760, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GroupSummaryChart>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const TwoGroups: Story = {
  args: {
    groups: groups.slice(0, 2),
  },
};

// More than 5 groups switches the donut to a horizontal-bar layout.
export const ManyGroupsHbar: Story = {
  args: {
    groups: [
      ...groups,
      { label: "Voucher convergent", channels: [ch("VOUCHER_CONV")], color: "#a855f7" },
      { label: "E-voucher", channels: [ch("EVOUCHER_2")], color: "#ec4899" },
    ],
  },
};

export const Loading: Story = {
  args: {
    // Never-resolving fetcher keeps the component in its loading state.
    fetchSpecChannelStats: () => new Promise(() => {}),
  },
};
