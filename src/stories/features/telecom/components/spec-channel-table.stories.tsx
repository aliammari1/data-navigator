import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { SpecChRow } from "@/features/telecom/lib/queries";
import type { ChannelDef } from "@/features/telecom/lib/report-engine";
import { SpecChannelTable } from "@/features/telecom/components/spec-channel-table";

const channels: ChannelDef[] = [
  { name: "IZIPAY", condition: "BRAND_D = 39" },
  { name: "SMT", condition: "BRAND_D = 12" },
  { name: "MOBIDOO", condition: "BRAND_D = 7" },
  { name: "AGENCE", condition: "BRAND_D = 1" },
];

const rows: SpecChRow[] = [
  { canal: "IZIPAY", nombre: 12_400, montant: 248_100.5 },
  { canal: "SMT", nombre: 8_100, montant: 121_500.0 },
  { canal: "MOBIDOO", nombre: 4_300, montant: 64_500.0 },
  { canal: "AGENCE", nombre: 0, montant: 0 },
];

const total: SpecChRow = {
  canal: "TOTAL",
  nombre: rows.reduce((a, r) => a + r.nombre, 0),
  montant: rows.reduce((a, r) => a + r.montant, 0),
};

const meta = {
  title: "Src/Features/Telecom/Components/SpecChannelTable",
  component: SpecChannelTable,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    channels,
    dateFrom: "2024-06-01",
    dateTo: "2024-06-01",
    title: "Paiement facture",
    fetchSpecChannelStats: async () => ({ rows, total }),
  },
  argTypes: {
    channels: { control: false },
    fetchSpecChannelStats: { control: false },
    title: { control: "text" },
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
} satisfies Meta<typeof SpecChannelTable>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: {
    fetchSpecChannelStats: async () => ({
      rows: channels.map((c) => ({ canal: c.name, nombre: 0, montant: 0 })),
      total: { canal: "TOTAL", nombre: 0, montant: 0 },
    }),
  },
};

export const Loading: Story = {
  args: {
    fetchSpecChannelStats: () => new Promise(() => {}),
  },
};
