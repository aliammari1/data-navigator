import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { VoiceLineSection } from "@/features/telecom/components/voice-line-section";
import type { SpecChRow } from "@/features/telecom/lib/queries";
import type { CanalRule } from "@/features/telecom/types";

const mockRule = (name: string): CanalRule => ({
  id: name.toLowerCase(),
  name,
  canalKey: "bill_payment",
  match: { kind: "brand", brandDValues: ["0"] },
  reportGroup: null,
  origin: "default",
  enabled: true,
  createdAt: "",
  updatedAt: "",
});

const ttcash: CanalRule[] = [mockRule("TTCASH FIXE"), mockRule("TTCASH MOBILE")];

const voucher: CanalRule[] = [mockRule("VOUCHER FIXE"), mockRule("VOUCHER MOBILE")];

const statsByChannel: Record<string, { nombre: number; montant: number }> = {
  "TTCASH FIXE": { nombre: 5_400, montant: 81_000 },
  "TTCASH MOBILE": { nombre: 8_100, montant: 121_500 },
  "VOUCHER FIXE": { nombre: 3_200, montant: 48_000 },
  "VOUCHER MOBILE": { nombre: 4_700, montant: 70_500 },
};

// Deterministic stand-in for the DuckDB-backed fetcher.
const fetchSpecChannelStats = async (channels: CanalRule[]) => {
  const rows: SpecChRow[] = channels.map((c) => {
    const s = statsByChannel[c.name] ?? { nombre: 1_000, montant: 15_000 };
    return { canal: c.name, nombre: s.nombre, montant: s.montant };
  });
  const total: SpecChRow = {
    canal: "TOTAL",
    nombre: rows.reduce((a, r) => a + r.nombre, 0),
    montant: rows.reduce((a, r) => a + r.montant, 0),
  };
  return { rows, total };
};

const meta = {
  title: "Src/Features/Telecom/Components/VoiceLineSection",
  component: VoiceLineSection,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    ttcash,
    voucher,
    dateFrom: "2024-06-01",
    dateTo: "2024-06-01",
    fetchSpecChannelStats,
  },
  argTypes: {
    ttcash: { control: false },
    voucher: { control: false },
    fetchSpecChannelStats: { control: false },
    dateFrom: { control: "text" },
    dateTo: { control: "text" },
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 820, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof VoiceLineSection>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: {
    fetchSpecChannelStats: async (channels: CanalRule[]) => ({
      rows: channels.map((c) => ({ canal: c.name, nombre: 0, montant: 0 })),
      total: { canal: "TOTAL", nombre: 0, montant: 0 },
    }),
  },
};
